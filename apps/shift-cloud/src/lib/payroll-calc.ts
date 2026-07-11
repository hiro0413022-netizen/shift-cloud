// payroll-calc.ts — 給与・勤怠計算の純粋ロジック（DBアクセス禁止・server-only禁止）
// tests/payroll-calc.test.ts から直接importしてテストする（金額はinteger円・時間はinteger分 DECISIONS #4）。
// 呼び出し元: lib/attendance.ts（自動休憩）、app/admin/payroll/actions.ts（給与計算）

/**
 * 段階式の自動休憩（労基法準拠）。拘束時間(分)から付与する休憩(分)を返す。
 * 労働6時間超 → 45分 / 8時間超 → 60分（9時間なら1時間）。
 */
export function autoBreakMinutes(spanMinutes: number): number {
  if (spanMinutes > 8 * 60) return 60;
  if (spanMinutes > 6 * 60) return 45;
  return 0;
}

/**
 * "YYYY-MM" → その月の初日と実在する月末日（両端inclusive）。
 * 旧実装の `${ym}-31` 固定は31日が無い月でPostgresのdateキャストエラーになる（監査D-1）。
 */
export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`不正な年月です: ${ym}`);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 翌月0日=当月末
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/** 日次実働の丸め（会社設定 rounding_minutes、floor。0なら丸めなし）DECISIONS #9 */
export function roundDailyWork(workMinutes: number, roundingMinutes: number): number {
  if (roundingMinutes > 0) return Math.floor(workMinutes / roundingMinutes) * roundingMinutes;
  return workMinutes;
}

export type DayAttendance = {
  staff_id: string;
  work_minutes: number;
  overtime_minutes: number;
};

export type StaffAggregate = { work: number; overtime: number; daysWorked: number };

/** 月次のスタッフ別集計（日次丸め→合算）。work_minutes>0の日を出勤日数にカウント。 */
export function aggregateAttendance(
  days: DayAttendance[],
  roundingMinutes: number
): Map<string, StaffAggregate> {
  const byStaff = new Map<string, StaffAggregate>();
  for (const d of days) {
    const cur = byStaff.get(d.staff_id) ?? { work: 0, overtime: 0, daysWorked: 0 };
    cur.work += roundDailyWork(d.work_minutes, roundingMinutes);
    cur.overtime += d.overtime_minutes;
    if (d.work_minutes > 0) cur.daysWorked += 1;
    byStaff.set(d.staff_id, cur);
  }
  return byStaff;
}

export type PayrollAmounts = {
  base_amount: number;
  overtime_amount: number;
  commute_amount: number;
  total_amount: number;
};

/**
 * スタッフ1名分の支給額計算。
 * - 通常分 = max(0, 丸め後実働合計 - 残業合計)。丸めで実働が残業を下回るケースの負値ガード（監査D-2）
 * - 端数は支給側でfloor（integer円 DECISIONS #4）
 */
export function calcPayrollAmounts(
  agg: StaffAggregate,
  hourlyWage: number,
  commuteAllowancePerDay: number,
  overtimeRate: number
): PayrollAmounts {
  const normalMin = Math.max(0, agg.work - agg.overtime);
  const base = Math.floor((normalMin / 60) * hourlyWage);
  const ot = Math.floor((agg.overtime / 60) * hourlyWage * overtimeRate);
  const commute = commuteAllowancePerDay * agg.daysWorked;
  return {
    base_amount: base,
    overtime_amount: ot,
    commute_amount: commute,
    total_amount: base + ot + commute,
  };
}
