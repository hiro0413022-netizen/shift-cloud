/**
 * FRANK GOLF 退会・休会の受付ルール（#192・2026-09-01 ユーザー確定）
 *
 * ★ 店のルール（そのまま関数にしてある）
 *   退会: 効力日は「月末」。申込月の翌月末より前は選べない。
 *         例) 9月末で退会したいなら 8月末までに申し出る。9月に申し出たら最短は10月末。
 *   休会: 開始は「月初」。当月10日までの申し出なら翌月から。11日以降は翌々月から。
 *         例) 10月から休会したいなら 9月10日まで。9月11日に申し出たら最短は11月から。
 *
 * ★ なぜ純関数に置くか
 *   この日付を間違えると「月会費が1か月余分に落ちる／止まりすぎる」＝そのままお金の事故になる。
 *   画面（選択肢の生成）とサーバー（受け取った日付の検証）で必ず同じ関数を通す。
 *   別の場所で月末計算を書き直さないこと。
 *
 * ★ Square との対応
 *   退会 → サブスクの canceled_date にこの「月末」を入れる（その月までは請求され、翌月から止まる）
 *   休会 → サブスクの pause_effective_date にこの「月初」を入れる
 */

/** 休会の申し出締切（この日までなら翌月から休会できる） */
export const SUSPEND_APPLY_DEADLINE_DAY = 10;

/** 選択肢を何か月先まで出すか */
export const SCHEDULE_MONTHS_AHEAD = 12;

type YM = { y: number; m: number }; // m は 1-12

function parseYm(ymd: string): YM {
  return { y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)) };
}
function dayOf(ymd: string): number {
  return Number(ymd.slice(8, 10));
}
function addMonths(ym: YM, n: number): YM {
  const total = ym.y * 12 + (ym.m - 1) + n;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}
const pad = (n: number) => String(n).padStart(2, "0");

/** その月の日数（月末日）。UTCで組むのでタイムゾーンでズレない */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "YYYY-MM-末日"。monthEnd("2026-09-15") -> "2026-09-30" */
export function monthEnd(ymd: string): string {
  const { y, m } = parseYm(ymd);
  return `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
}

/** "YYYY-MM-01" */
export function monthStart(ymd: string): string {
  const { y, m } = parseYm(ymd);
  return `${y}-${pad(m)}-01`;
}

/* ============================ 退会 ============================ */

/** 申込日 today（JST YYYY-MM-DD）に対して選べる最短の退会日＝翌月末 */
export function earliestLeaveDate(today: string): string {
  const n = addMonths(parseYm(today), 1);
  return `${n.y}-${pad(n.m)}-${pad(daysInMonth(n.y, n.m))}`;
}

/** 退会日の選択肢（翌月末から SCHEDULE_MONTHS_AHEAD か月ぶんの月末） */
export function leaveDateOptions(today: string, monthsAhead = SCHEDULE_MONTHS_AHEAD): string[] {
  const base = parseYm(today);
  const out: string[] = [];
  for (let i = 1; i <= monthsAhead; i++) {
    const n = addMonths(base, i);
    out.push(`${n.y}-${pad(n.m)}-${pad(daysInMonth(n.y, n.m))}`);
  }
  return out;
}

/** 受け取った退会日が受付ルールに合っているか（月末であること＋翌月末以降であること） */
export function canLeaveOn(today: string, date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date !== monthEnd(date)) return false; // 月末以外は受け付けない
  return date >= earliestLeaveDate(today);
}

/** 「その退会日にするための申し出の締切」＝退会月の前月末。画面の説明文に出す */
export function leaveApplyDeadline(leaveDate: string): string {
  const prev = addMonths(parseYm(leaveDate), -1);
  return `${prev.y}-${pad(prev.m)}-${pad(daysInMonth(prev.y, prev.m))}`;
}

/* ============================ 休会 ============================ */

/** 申込日 today に対して選べる最短の休会開始日。
 *  10日までなら翌月1日、11日以降は翌々月1日。 */
export function earliestSuspendStart(today: string): string {
  const offset = dayOf(today) <= SUSPEND_APPLY_DEADLINE_DAY ? 1 : 2;
  const n = addMonths(parseYm(today), offset);
  return `${n.y}-${pad(n.m)}-01`;
}

/** 休会開始日の選択肢（最短月から SCHEDULE_MONTHS_AHEAD か月ぶんの月初） */
export function suspendStartOptions(today: string, monthsAhead = SCHEDULE_MONTHS_AHEAD): string[] {
  const first = parseYm(earliestSuspendStart(today));
  const out: string[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const n = addMonths(first, i);
    out.push(`${n.y}-${pad(n.m)}-01`);
  }
  return out;
}

/** 受け取った休会開始日が受付ルールに合っているか（月初であること＋最短月以降であること） */
export function canSuspendFrom(today: string, date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (dayOf(date) !== 1) return false; // 月初以外は受け付けない
  return date >= earliestSuspendStart(today);
}

/** 「その月から休会するための申し出の締切」＝前月10日。画面の説明文に出す */
export function suspendApplyDeadline(suspendStart: string): string {
  const prev = addMonths(parseYm(suspendStart), -1);
  return `${prev.y}-${pad(prev.m)}-${pad(SUSPEND_APPLY_DEADLINE_DAY)}`;
}

/* ============================ 表示用 ============================ */

/** "2026-10-31" -> "2026年10月末" */
export function monthEndLabel(ymd: string): string {
  const { y, m } = parseYm(ymd);
  return `${y}年${m}月末`;
}

/** "2026-10-01" -> "2026年10月から" */
export function monthFromLabel(ymd: string): string {
  const { y, m } = parseYm(ymd);
  return `${y}年${m}月から`;
}

/** "2026-09-10" -> "9月10日" */
export function mdLabel(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;
}
