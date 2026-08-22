// payslip-sheet.ts — 給与明細PDF（出勤簿つき）の日別行を組み立てる純粋ロジック
// DBアクセス禁止・server-only禁止（tests/payslip-sheet.test.ts から直接importする）。
// 行の出し方は /admin/attendance と同じ考え方（BUGFIX 2026-08-04）:
//   attendance_days は打刻か修正が無いと行が作られないため、
//   「確定シフトがあり・当日以前で・勤怠行が無い日」を『打刻なし』行として混ぜる。
// 呼び出し元: app/admin/payroll/pdf/route.ts

// .ts拡張子つき: tests/ から node --test（型ストリップ実行）で直接importするため
// （tsconfigは allowImportingTsExtensions: true）
import { timeJST, hm, dowJP } from "./util.ts";

/** attendance_days の必要カラムだけ（route側のselectと揃える） */
export type SheetAttendanceDay = {
  staff_id: string;
  date: string; // YYYY-MM-DD
  clock_in: string | null; // timestamptz
  clock_out: string | null;
  break_minutes: number;
  break_override_minutes: number | null;
  work_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  is_missing_clock: boolean;
  status: string;
};

/** shifts（published のみ渡すこと）の必要カラムだけ */
export type SheetShift = {
  staff_id: string;
  date: string;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  is_day_off: boolean;
};

export type SheetDay = {
  date: string; // YYYY-MM-DD
  /** "7/1（水）" 形式 */
  dateLabel: string;
  /** "10:45〜19:45" / シフトなしは "" */
  shiftLabel: string;
  clockIn: string; // "10:42" / "—"
  clockOut: string;
  /** "60分" / 手動上書きは "60分＊" / 打刻なしは "—" */
  breakLabel: string;
  /** 分。打刻なし行は null */
  workMinutes: number | null;
  overtimeMinutes: number;
  /** 遅刻15分・早退5分・打刻漏れ・打刻なし・修正済 など */
  notes: string[];
};

function shiftLabelOf(s: SheetShift | undefined): string {
  if (!s || s.is_day_off || !s.start_time || !s.end_time) return "";
  return `${hm(s.start_time)}〜${hm(s.end_time)}`;
}

function dateLabelOf(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}（${dowJP(date)}）`;
}

/**
 * 1スタッフ分の日別出勤簿行を作る。
 * @param days   対象月の attendance_days（複数スタッフ混在でよい）
 * @param shifts 対象月の確定シフト（status='published'・deleted_at無しのみ渡す）
 * @param staffId 対象スタッフ
 * @param todayJst 「打刻なし」判定の上限日（未来のシフトは出さない）
 */
export function buildSheetDays(
  days: SheetAttendanceDay[],
  shifts: SheetShift[],
  staffId: string,
  todayJst: string
): SheetDay[] {
  const shiftByDate = new Map<string, SheetShift>();
  for (const s of shifts) {
    if (s.staff_id === staffId) shiftByDate.set(s.date, s);
  }

  const out: SheetDay[] = [];
  const attendedDates = new Set<string>();

  for (const d of days) {
    if (d.staff_id !== staffId) continue;
    attendedDates.add(d.date);
    const notes: string[] = [];
    if (d.is_missing_clock) notes.push("打刻漏れ");
    if (d.late_minutes > 0) notes.push(`遅刻${d.late_minutes}分`);
    if (d.early_leave_minutes > 0) notes.push(`早退${d.early_leave_minutes}分`);
    if (d.status === "corrected") notes.push("修正済");
    out.push({
      date: d.date,
      dateLabel: dateLabelOf(d.date),
      shiftLabel: shiftLabelOf(shiftByDate.get(d.date)),
      clockIn: timeJST(d.clock_in),
      clockOut: timeJST(d.clock_out),
      breakLabel: `${d.break_minutes}分${d.break_override_minutes != null ? "＊" : ""}`,
      workMinutes: d.work_minutes,
      overtimeMinutes: d.overtime_minutes,
      notes,
    });
  }

  // 丸一日打刻なし（確定シフトあり・当日以前・勤怠行なし）
  for (const [date, s] of shiftByDate) {
    if (s.is_day_off || !s.start_time) continue;
    if (date > todayJst) continue;
    if (attendedDates.has(date)) continue;
    out.push({
      date,
      dateLabel: dateLabelOf(date),
      shiftLabel: shiftLabelOf(s),
      clockIn: "—",
      clockOut: "—",
      breakLabel: "—",
      workMinutes: null,
      overtimeMinutes: 0,
      notes: ["打刻なし"],
    });
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 出勤簿の合計（丸め前の生分数）。給与側は日次丸め後合算のため一致しないことがある */
export function sumSheetDays(rows: SheetDay[]): {
  workMinutes: number;
  overtimeMinutes: number;
  daysWorked: number;
  missingDays: number;
} {
  let work = 0, overtime = 0, daysWorked = 0, missing = 0;
  for (const r of rows) {
    if (r.workMinutes == null) { missing += 1; continue; }
    work += r.workMinutes;
    overtime += r.overtimeMinutes;
    if (r.workMinutes > 0) daysWorked += 1;
  }
  return { workMinutes: work, overtimeMinutes: overtime, daysWorked, missingDays: missing };
}
