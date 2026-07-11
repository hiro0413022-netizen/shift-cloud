import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { jstDateTime } from "@/lib/util";
import { autoBreakMinutes } from "@/lib/payroll-calc";

// 純粋ロジックは payroll-calc.ts へ集約（テスト対象）。既存importの互換のため再export。
export { autoBreakMinutes };

type TimeRecord = {
  id: string;
  type: "clock_in" | "clock_out" | "break_start" | "break_end";
  recorded_at: string;
  correction_of: string | null;
};

type RecalcOpts = {
  /**
   * 休憩の手動上書き。
   * - 省略(undefined): DBの既存 break_override_minutes をそのまま維持
   * - number: その分数で上書き（0=休憩なしの手動指定）
   * - null: 上書きを解除して自動計算に戻す
   */
  breakOverride?: number | null;
};

/**
 * 指定スタッフ・日付の勤怠を打刻イベントから再計算してattendance_daysへupsert。
 * 修正打刻（correction_of）は元打刻を置き換える（DECISIONS #6）。
 *
 * 休憩の決定順位：
 *   1) 手動上書き(break_override_minutes)があればそれ
 *   2) 休憩打刻(break_start/break_end)があればその合計
 *   3) どちらも無ければ拘束時間から段階式に自動付与
 */
export async function recalcAttendance(
  companyId: string,
  staffId: string,
  date: string,
  opts: RecalcOpts = {},
) {
  const admin = createAdmin();

  // JSTの1日ウィンドウ
  const from = `${date}T00:00:00+09:00`;
  const to = `${date}T23:59:59+09:00`;

  const { data: records } = await admin
    .from("time_records")
    .select("id, type, recorded_at, correction_of, store_id")
    .eq("staff_id", staffId)
    .gte("recorded_at", from)
    .lte("recorded_at", to)
    .order("recorded_at");

  const all = (records ?? []) as (TimeRecord & { store_id: string })[];
  // 修正で置き換えられた打刻を除外
  const superseded = new Set(all.map((r) => r.correction_of).filter(Boolean));
  const effective = all.filter((r) => !superseded.has(r.id));

  const clockIns = effective.filter((r) => r.type === "clock_in");
  const clockOuts = effective.filter((r) => r.type === "clock_out");
  const clockIn = clockIns[0]?.recorded_at ?? null;
  const clockOut = clockOuts.length ? clockOuts[clockOuts.length - 1].recorded_at : null;

  // 休憩打刻ペア集計
  let punchedBreak = 0;
  let breakStart: string | null = null;
  for (const r of effective) {
    if (r.type === "break_start") breakStart = r.recorded_at;
    if (r.type === "break_end" && breakStart) {
      punchedBreak += Math.round(
        (new Date(r.recorded_at).getTime() - new Date(breakStart).getTime()) / 60000
      );
      breakStart = null;
    }
  }

  // 休憩の手動上書き値を決定（呼び出しで指定が無ければDBの既存値を維持）
  let override: number | null;
  if ("breakOverride" in opts) {
    override = opts.breakOverride ?? null;
  } else {
    const { data: existing } = await admin
      .from("attendance_days")
      .select("break_override_minutes")
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle();
    override = existing?.break_override_minutes ?? null;
  }

  // 確定シフト
  const { data: shift } = await admin
    .from("shifts")
    .select("id, start_time, end_time, is_day_off, store_id")
    .eq("staff_id", staffId)
    .eq("date", date)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();

  const hasWorkShift = !!shift && !shift.is_day_off && !!shift.start_time;

  if (effective.length === 0 && !hasWorkShift) {
    // 打刻もシフトもない日はレコード不要
    await admin.from("attendance_days").delete().eq("staff_id", staffId).eq("date", date);
    return;
  }

  // 拘束時間（出退勤の差）
  const spanMinutes =
    clockIn && clockOut
      ? Math.max(0, Math.round((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000))
      : 0;

  // 実効休憩：手動上書き＞休憩打刻＞段階式自動
  const autoBreak = autoBreakMinutes(spanMinutes);
  const breakMinutes =
    override != null ? override : punchedBreak > 0 ? punchedBreak : autoBreak;

  const workMinutes = clockIn && clockOut ? Math.max(0, spanMinutes - breakMinutes) : 0;

  let late = 0, early = 0, overtime = 0;
  if (hasWorkShift && shift) {
    const s = jstDateTime(date, shift.start_time!);
    const e = jstDateTime(date, shift.end_time!);
    if (clockIn) late = Math.max(0, Math.round((new Date(clockIn).getTime() - s.getTime()) / 60000));
    if (clockOut) {
      early = Math.max(0, Math.round((e.getTime() - new Date(clockOut).getTime()) / 60000));
      overtime = Math.max(0, Math.round((new Date(clockOut).getTime() - e.getTime()) / 60000));
    }
  }

  const isMissing = hasWorkShift && (!clockIn || !clockOut);
  const wasCorrected = effective.some((r) => r.correction_of) || override != null;
  const storeId = shift?.store_id ?? effective[0]?.store_id;
  if (!storeId) return;

  await admin.from("attendance_days").upsert(
    {
      company_id: companyId,
      staff_id: staffId,
      store_id: storeId,
      date,
      shift_id: shift?.id ?? null,
      clock_in: clockIn,
      clock_out: clockOut,
      break_minutes: breakMinutes,
      break_override_minutes: override,
      work_minutes: workMinutes,
      late_minutes: late,
      early_leave_minutes: early,
      overtime_minutes: overtime,
      is_missing_clock: isMissing,
      status: wasCorrected ? "corrected" : "auto",
    },
    { onConflict: "staff_id,date" }
  );
}
