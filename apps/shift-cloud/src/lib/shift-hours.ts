/**
 * シフト作成の「総労働時間」（#255・純関数・DBアクセス禁止）
 *
 * ユーザー要望「シフト作成時の下書きのときに、総労働時間を名前の横に出してほしい」。
 * 組んでいる途中（下書き・未保存を含む）の予定時間を、表示中の期間で人ごとに足す。
 *
 * 決めごと:
 *   - 1日の労働時間 = 拘束時間 − 自動休憩（6時間超45分／8時間超60分）。
 *     打刻の自動休憩（lib/attendance.ts）と同じ関数を使う＝給与の見込みとずれない。
 *   - 終了が開始より前（例 18:00-02:00）は日をまたいだとみなす。
 *   - 休みテンプレは0。業務（キャディ等）は時刻を持たないので時間には入れず「業務◯日」で別に数える。
 *   - 時刻が片方しか無いマス（入力途中）は数えない。
 */
import { autoBreakMinutes } from "./payroll-calc.ts";

export type HoursTemplate = { id: string; start_time: string | null; end_time: string | null; is_day_off: boolean };
export type HoursCell = {
  template_id: string | null;
  schedule_type_id: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
};

function toMin(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

/** 開始・終了から、休憩を引いた労働分。数えられないときは null */
export function workMinutesBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  const s = toMin(start);
  const e = toMin(end);
  if (s == null || e == null) return null;
  let span = e - s;
  if (span <= 0) span += 24 * 60; // 日またぎ
  if (span <= 0 || span > 24 * 60) return null;
  return span - autoBreakMinutes(span);
}

export type CellKind = "work" | "off" | "duty" | "none";

/** 1マスの中身を「何分働くか」に落とす */
export function cellWork(
  cell: HoursCell | null | undefined,
  templates: Map<string, HoursTemplate>,
): { kind: CellKind; minutes: number } {
  if (!cell) return { kind: "none", minutes: 0 };
  if (cell.schedule_type_id) return { kind: "duty", minutes: 0 };
  if (cell.template_id) {
    const t = templates.get(cell.template_id);
    if (!t) return { kind: "none", minutes: 0 };
    if (t.is_day_off) return { kind: "off", minutes: 0 };
    const m = workMinutesBetween(t.start_time, t.end_time);
    return m == null ? { kind: "duty", minutes: 0 } : { kind: "work", minutes: m };
  }
  const m = workMinutesBetween(cell.start_time, cell.end_time);
  return m == null ? { kind: "none", minutes: 0 } : { kind: "work", minutes: m };
}

export type StaffHours = {
  /** 表示中の期間の労働分（確定＋下書き） */
  minutes: number;
  /** うち下書き（未確定）の分 */
  draftMinutes: number;
  /** 時間のある出勤日数 */
  workDays: number;
  /** 業務（時刻なし）の日数 */
  dutyDays: number;
};

/** 人ごと×表示中の日付で合計する。grid のキーは "staffId|YYYY-MM-DD" */
export function staffPeriodHours(
  staffId: string,
  days: string[],
  grid: Record<string, HoursCell | undefined>,
  templates: Map<string, HoursTemplate>,
): StaffHours {
  const out: StaffHours = { minutes: 0, draftMinutes: 0, workDays: 0, dutyDays: 0 };
  for (const d of days) {
    const c = grid[`${staffId}|${d}`];
    const w = cellWork(c, templates);
    if (w.kind === "work") {
      out.minutes += w.minutes;
      out.workDays += 1;
      if (c && c.status !== "published") out.draftMinutes += w.minutes;
    } else if (w.kind === "duty") {
      out.dutyDays += 1;
    }
  }
  return out;
}

/** 480 → "8h" / 510 → "8.5h" / 525 → "8h45m"（30分単位は小数、それ以外は分で） */
export function formatWorkHours(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h}h`;
  if (r === 30) return `${h}.5h`;
  return `${h}h${String(r).padStart(2, "0")}m`;
}
