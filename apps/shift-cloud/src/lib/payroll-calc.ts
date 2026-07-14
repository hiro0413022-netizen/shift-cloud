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

/* ============================================================
   時給の月中変更対応（日付按分 / AUDIT D-3・DECISIONS #39）
   旧実装は「月末時点で有効な賃金」を月全体に適用していたため、
   月中の時給変更が変更前の日にも遡及していた。
   新実装: 日ごとに「その日に有効な賃金」を引き、レート別に集計して合算する。
   単一時給のスタッフは従来と完全に同一の結果になる（テストで固定）。
   ============================================================ */

export type WageRow = {
  staff_id: string;
  hourly_wage: number;
  commute_allowance: number | null;
  effective_from: string; // YYYY-MM-DD
  /** 'monthly' なら monthly_salary を固定支給し、実労働時間は金額に影響しない（DECISIONS #44） */
  wage_type?: "hourly" | "monthly";
  monthly_salary?: number | null;
};

/* ============================================================
   手当（DECISIONS #44 / migration 0035）
   実際のGOLF WING給与明細で確認した支給式:
     時給者 = 時給×実労働 + 交通費日額×出勤日数 + Σ手当
     月給者 = 月給（固定）   + 交通費実費           + Σ手当
   手当の内訳: パーソナル(単価×件数) / フィッティング紹介料 / コンペ / ラウンドレッスン
   `commute_actual` だけは交通費(commute_amount)側に足す（課税区分が違うため分けて持つ）。
   ============================================================ */

export type AllowanceRow = {
  staff_id: string;
  kind: "personal" | "fitting_referral" | "compe" | "round_lesson" | "commute_actual" | "other";
  amount: number;
};

export type PayrollOptions = {
  /** 月末日（YYYY-MM-DD）。月給者に適用する賃金行の判定に使う */
  monthEnd?: string;
  allowances?: AllowanceRow[];
  /** 勤怠が0日でも計算対象に含めるスタッフ（月給者・役員は出勤日数0で満額支給される） */
  includeStaffIds?: string[];
};

/** スタッフ別の手当合計。commute_actual は交通費側へ回すため分けて返す */
export function sumAllowances(
  rows: AllowanceRow[],
  staffId: string
): { allowance: number; commuteActual: number } {
  let allowance = 0;
  let commuteActual = 0;
  for (const r of rows) {
    if (r.staff_id !== staffId) continue;
    const amt = Math.max(0, Math.floor(Number(r.amount) || 0));
    if (r.kind === "commute_actual") commuteActual += amt;
    else allowance += amt;
  }
  return { allowance, commuteActual };
}

/**
 * その日に有効な賃金（effective_from <= date の最新）。
 * 該当が無い場合（賃金行の開始日より前の勤務日）は、そのスタッフの最古の賃金行へ
 * フォールバックする — 旧実装は月末時点の賃金を全日に適用していたため、
 * 「時給登録が勤務より後日だった」ケースで突然0円にならないようにする安全策。
 */
export function wageOnDate(wages: WageRow[], staffId: string, date: string): WageRow | null {
  let best: WageRow | null = null;
  let earliest: WageRow | null = null;
  for (const w of wages) {
    if (w.staff_id !== staffId) continue;
    if (!earliest || w.effective_from < earliest.effective_from) earliest = w;
    if (w.effective_from > date) continue;
    if (!best || w.effective_from > best.effective_from) best = w;
  }
  return best ?? earliest;
}

export type WagePeriodBreakdown = {
  hourly_wage: number;
  commute_allowance: number;
  from_date: string; // このレートが適用された最初の勤務日
  to_date: string; // 同・最後の勤務日
  work_minutes: number;
  overtime_minutes: number;
  days_worked: number;
  base_amount: number;
  overtime_amount: number;
  commute_amount: number;
};

export type MonthlyPayrollResult = StaffAggregate &
  PayrollAmounts & {
    periods: WagePeriodBreakdown[];
    allowance_amount: number;
    /** 'monthly' の場合、実労働時間は支給額に影響しない（説明可能性のため記録） */
    wage_type: "hourly" | "monthly";
  };

/**
 * 月次給与計算（スタッフ別・時給レート別の按分つき）。
 * - 日次丸め（roundDailyWork）→ レート別に集計 → レートごとに calcPayrollAmounts → 合算
 * - 交通費/日もその日に有効な賃金の commute_allowance を使う
 * - opts を渡すと 月給者（wage_type='monthly'）と 手当 を反映する（DECISIONS #44）。
 *   opts 無しの呼び出しは従来と完全に同じ結果（後方互換 / テストで固定）。
 */
export function calcMonthlyPayroll(
  days: Array<DayAttendance & { date: string }>,
  wages: WageRow[],
  roundingMinutes: number,
  overtimeRate: number,
  opts: PayrollOptions = {}
): Map<string, MonthlyPayrollResult> {
  const allowances = opts.allowances ?? [];
  // staffId → レートキー → 集計
  type Bucket = { hourly: number; commute: number; from: string; to: string; agg: StaffAggregate };
  const byStaff = new Map<string, Map<string, Bucket>>();
  for (const d of days) {
    const w = wageOnDate(wages, d.staff_id, d.date);
    const hourly = w?.hourly_wage ?? 0;
    const commute = w?.commute_allowance ?? 0;
    const key = `${hourly}|${commute}`;
    const staffBuckets = byStaff.get(d.staff_id) ?? new Map<string, Bucket>();
    const bucket =
      staffBuckets.get(key) ??
      { hourly, commute, from: d.date, to: d.date, agg: { work: 0, overtime: 0, daysWorked: 0 } };
    bucket.agg.work += roundDailyWork(d.work_minutes, roundingMinutes);
    bucket.agg.overtime += d.overtime_minutes;
    if (d.work_minutes > 0) bucket.agg.daysWorked += 1;
    if (d.date < bucket.from) bucket.from = d.date;
    if (d.date > bucket.to) bucket.to = d.date;
    staffBuckets.set(key, bucket);
    byStaff.set(d.staff_id, staffBuckets);
  }

  // 勤怠0日でも支給される人（月給者・役員）を対象に含める（DECISIONS #44）
  for (const sid of opts.includeStaffIds ?? []) {
    if (!byStaff.has(sid)) byStaff.set(sid, new Map());
  }

  const results = new Map<string, MonthlyPayrollResult>();
  for (const [staffId, buckets] of byStaff) {
    const { allowance, commuteActual } = sumAllowances(allowances, staffId);
    // 月給/時給の判定は「月末時点で有効な賃金行」で行う（賃金種別は月中で変わらない前提）
    const wageAtEnd = wageOnDate(wages, staffId, opts.monthEnd ?? "9999-12-31");
    const isMonthly = wageAtEnd?.wage_type === "monthly";

    const r: MonthlyPayrollResult = {
      work: 0, overtime: 0, daysWorked: 0,
      base_amount: 0, overtime_amount: 0, commute_amount: 0, total_amount: 0,
      periods: [],
      allowance_amount: allowance,
      wage_type: isMonthly ? "monthly" : "hourly",
    };
    const sorted = [...buckets.values()].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

    if (isMonthly) {
      // 月給: 実労働時間は金額に影響しない。交通費は実費（commute_actual）。
      // 実費が無ければ従来どおり「日額×出勤日数」にフォールバックする。
      for (const b of sorted) {
        r.work += b.agg.work;
        r.overtime += b.agg.overtime;
        r.daysWorked += b.agg.daysWorked;
      }
      r.base_amount = Math.max(0, Math.floor(Number(wageAtEnd?.monthly_salary ?? 0)));
      r.commute_amount =
        commuteActual > 0 ? commuteActual : (wageAtEnd?.commute_allowance ?? 0) * r.daysWorked;
      r.total_amount = r.base_amount + r.overtime_amount + r.commute_amount + r.allowance_amount;
      results.set(staffId, r);
      continue;
    }

    for (const b of sorted) {
      const a = calcPayrollAmounts(b.agg, b.hourly, b.commute, overtimeRate);
      r.work += b.agg.work;
      r.overtime += b.agg.overtime;
      r.daysWorked += b.agg.daysWorked;
      r.base_amount += a.base_amount;
      r.overtime_amount += a.overtime_amount;
      r.commute_amount += a.commute_amount;
      r.total_amount += a.total_amount;
      r.periods.push({
        hourly_wage: b.hourly,
        commute_allowance: b.commute,
        from_date: b.from,
        to_date: b.to,
        work_minutes: b.agg.work,
        overtime_minutes: b.agg.overtime,
        days_worked: b.agg.daysWorked,
        base_amount: a.base_amount,
        overtime_amount: a.overtime_amount,
        commute_amount: a.commute_amount,
      });
    }
    // 時給者は交通費実費が入っていればそれを優先（日額運用と併用しない前提）
    if (commuteActual > 0) {
      r.total_amount += commuteActual - r.commute_amount;
      r.commute_amount = commuteActual;
    }
    r.total_amount += r.allowance_amount;
    results.set(staffId, r);
  }
  return results;
}

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
