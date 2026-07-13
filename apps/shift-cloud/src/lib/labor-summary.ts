// labor-summary.ts — 「労働時間・人件費」の集計（純粋ロジック・DBアクセス禁止・server-only禁止）
//
// 【なぜこのファイルがあるか / DECISIONS #53】
// 本部ダッシュボード(/hq)が独自に work_minutes を合計し hourly_wage を掛けていたため、
// 給与画面(/admin/payroll)と数字がズレていた（15分丸めなし・月給者0円扱い・交通費/手当なし）。
// 画面ごとに集計を書くと必ずまた割れる。**労働時間と人件費の計算はここ1本に集約する。**
//
// ルール（DEVELOPMENT_RULES.md「給与・労働時間の計算」）:
//   - work_minutes を画面側で直接 sum しない → summarizeLabor() を使う
//   - hourly_wage を画面側で直接掛けない     → payroll-calc.ts の calcMonthlyPayroll に任せる
//   - 休憩は attendance_days.work_minutes の時点で控除済み（recalcAttendance = 拘束 − 休憩）
//     ここでさらに引かない（二重控除になる）
//
// scripts/check-labor-logic.mjs がCIでこの規約を機械的に検査する。

import {
  calcMonthlyPayroll,
  roundDailyWork,
  type WageRow,
  type AllowanceRow,
  type MonthlyPayrollResult,
  // ※ .ts 拡張子付き = tests/ から node --test で直接importできるようにするため
  //   （tsconfig の allowImportingTsExtensions で許可。Next/webpackはそのまま解決する）
} from "./payroll-calc.ts";

export type LaborDay = {
  staff_id: string;
  store_id: string;
  date: string;
  work_minutes: number;
  overtime_minutes: number;
  is_missing_clock?: boolean | null;
};

export type StoreLabor = {
  /** 丸め後の実働（分） */
  work: number;
  overtime: number;
  /** 支給総額の按分（円） */
  cost: number;
  missing: number;
  staff: Set<string>;
};

export type LaborSummary = {
  totalWork: number;
  totalCost: number;
  totalMissing: number;
  byStore: Map<string, StoreLabor>;
  byStaff: Map<string, MonthlyPayrollResult>;
};

export type LaborInput = {
  days: LaborDay[];
  wages: WageRow[];
  allowances?: AllowanceRow[];
  /** companies.settings.rounding_minutes（GOLF WING=15） */
  roundingMinutes: number;
  /** companies.settings.overtime_rate */
  overtimeRate: number;
  /** 月末日（YYYY-MM-DD）。月給判定に使う */
  monthEnd: string;
  /** 実働に紐づかない支給（月給者・役員）の計上先。無ければ店舗別には出ない（総額には入る） */
  primaryStoreOf: (staffId: string) => string | null;
};

const blank = (): StoreLabor => ({ work: 0, overtime: 0, cost: 0, missing: 0, staff: new Set<string>() });

/**
 * 月次の労働時間・人件費を集計する。金額は給与計算(calcMonthlyPayroll)と1円単位で一致する。
 *
 * 店舗別の人件費は「その月の店舗別・丸め後実働時間」で比例配分し、端数は最大の店舗へ寄せる
 * （合計＝支給総額が必ず保たれる）。実働0のスタッフ（月給者・役員）は主店舗へ全額計上。
 */
export function summarizeLabor(input: LaborInput): LaborSummary {
  const { days, wages, roundingMinutes, overtimeRate, monthEnd, primaryStoreOf } = input;
  const allowances = input.allowances ?? [];

  const monthlyStaffIds = [...new Set(wages.filter((w) => w.wage_type === "monthly").map((w) => w.staff_id))];

  const byStaff = calcMonthlyPayroll(
    days.map((d) => ({
      staff_id: d.staff_id,
      date: d.date,
      work_minutes: d.work_minutes,
      overtime_minutes: d.overtime_minutes,
    })),
    wages,
    roundingMinutes,
    overtimeRate,
    { monthEnd, allowances, includeStaffIds: monthlyStaffIds }
  );

  const byStore = new Map<string, StoreLabor>();
  const staffStoreMinutes = new Map<string, Map<string, number>>();

  for (const d of days) {
    const rounded = roundDailyWork(d.work_minutes, roundingMinutes);
    const cur = byStore.get(d.store_id) ?? blank();
    cur.work += rounded;
    cur.overtime += d.overtime_minutes;
    if (d.is_missing_clock) cur.missing += 1;
    if (d.work_minutes > 0) cur.staff.add(d.staff_id);
    byStore.set(d.store_id, cur);

    const m = staffStoreMinutes.get(d.staff_id) ?? new Map<string, number>();
    m.set(d.store_id, (m.get(d.store_id) ?? 0) + rounded);
    staffStoreMinutes.set(d.staff_id, m);
  }

  for (const [staffId, r] of byStaff) {
    const shares = [...(staffStoreMinutes.get(staffId) ?? new Map<string, number>()).entries()]
      .filter(([, min]) => min > 0)
      .sort((a, b) => b[1] - a[1]);
    const totalMin = shares.reduce((s, [, min]) => s + min, 0);

    if (totalMin === 0) {
      const sid = primaryStoreOf(staffId);
      if (!sid) continue; // 主店舗なし → 店舗別には出さない（総額には含まれる）
      const cur = byStore.get(sid) ?? blank();
      cur.cost += r.total_amount;
      cur.staff.add(staffId);
      byStore.set(sid, cur);
      continue;
    }

    let assigned = 0;
    shares.forEach(([sid, min], i) => {
      const amount =
        i === shares.length - 1 ? r.total_amount - assigned : Math.floor((r.total_amount * min) / totalMin);
      assigned += amount;
      const cur = byStore.get(sid) ?? blank();
      cur.cost += amount;
      byStore.set(sid, cur);
    });
  }

  return {
    totalWork: [...byStaff.values()].reduce((s, r) => s + r.work, 0),
    totalCost: [...byStaff.values()].reduce((s, r) => s + r.total_amount, 0),
    totalMissing: days.filter((d) => d.is_missing_clock).length,
    byStore,
    byStaff,
  };
}
