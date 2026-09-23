/**
 * 「いま出勤しているのは誰か」（#273・2026-09-24）
 *
 * ドリンクの注文が入った瞬間に、その時間シフトに入っているスタッフへLINEを送るために要る。
 * シフト表の読み方に癖があるので、判定は純関数にしてテストで固める。
 *
 * ★ 時間が空のシフトがある
 *   FRANKは「出勤日だけ決めて時刻は決めない」行が普通にある（is_day_off=false・start/end が null）。
 *   ここを「時間が無い＝対象外」にすると、その人にはいつまでも通知が飛ばない。
 *   時刻が無い行は**その日は終日出勤**として扱う。
 *
 * ★ 下書き（draft）は送らない
 *   本人がまだ見ていないシフトで呼び出すと「出てないのに呼ばれた」になる。published だけ。
 *
 * ★ 日をまたぐ勤務
 *   end <= start の行は翌日の end まで続いているとみなす（22:15→翌1:00 のような遅番）。
 *   前日ぶんの行も渡してもらう前提で、日付をまたいだ窓を自分で組む。
 *
 * ★ 前後の余裕（grace）
 *   開店の10分前・閉店の5分後の注文で誰にも飛ばないのがいちばん困るので、既定で前後15分広げる。
 */

export type ShiftRowLike = {
  staff_id: string;
  /** "YYYY-MM-DD"（JSTの暦日） */
  date: string;
  /** "HH:MM" または "HH:MM:SS"。null＝時刻未設定（終日） */
  start_time?: string | null;
  end_time?: string | null;
  is_day_off?: boolean | null;
  status?: string | null;
};

/** JSTの「いま」。date は暦日、minutes は 0:00 からの分 */
export type JstMoment = { date: string; minutes: number };

const DAY = 24 * 60;

/** "HH:MM[:SS]" を 0:00 からの分に。読めなければ null */
export function hhmmToMinutes(v: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/** "YYYY-MM-DD" の翌日 */
export function nextYmd(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** その行が「いま」に当たるか */
export function shiftCoversMoment(row: ShiftRowLike, now: JstMoment, graceMinutes = 15): boolean {
  if (row.is_day_off) return false;
  if (String(row.status ?? "") !== "published") return false;

  const start = hhmmToMinutes(row.start_time);
  const end = hhmmToMinutes(row.end_time);

  // 時刻未設定＝その日は終日出勤
  if (start === null || end === null) return row.date === now.date;

  // 行の date の 0:00 を原点にした分に、「いま」を写す
  let nowRel: number;
  if (now.date === row.date) nowRel = now.minutes;
  else if (now.date === nextYmd(row.date)) nowRel = now.minutes + DAY;
  else return false;

  // end <= start は日またぎ＝翌日の end まで
  const endRel = end <= start ? end + DAY : end;
  return nowRel >= start - graceMinutes && nowRel < endRel + graceMinutes;
}

/** いま出勤している staff_id（重複なし・入力順） */
export function staffOnShiftAt(rows: ShiftRowLike[], now: JstMoment, graceMinutes = 15): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.staff_id || seen.has(r.staff_id)) continue;
    if (!shiftCoversMoment(r, now, graceMinutes)) continue;
    seen.add(r.staff_id);
    out.push(r.staff_id);
  }
  return out;
}

/** DBから読む日付の範囲（前日ぶんも要る＝日またぎの遅番を落とさない） */
export function shiftDateRange(now: JstMoment): { from: string; to: string } {
  const d = new Date(`${now.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { from: d.toISOString().slice(0, 10), to: now.date };
}
