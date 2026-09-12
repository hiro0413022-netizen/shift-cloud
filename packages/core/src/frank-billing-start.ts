/**
 * FRANK 月会費の「いつ・何月分を」引き落とすか（日付の正典）
 *
 * ★ 2026-09-11 ユーザー決定（#235）: **毎月10日に、翌月分を引き落とす**。
 *   例 11月10日 → 12月分。全会員同じ日（それまでは「入会日と同じ日」で人によってバラバラだった）。
 *
 * ★ 入会時（キャンペーン・#131）: 無料になるのはご利用開始月（#234）、前取りはその翌月・翌々月。
 *   自動の引き落としは「前取りが終わった次の月の分」から ＝ その前月10日。
 *   例 9/11 入会・ご利用開始 9月 → 9月無料／10月・11月は入会時に前取り／12月分を 11/10 に
 *   例 9/11 入会・ご利用開始 11/2 → 11月無料／12月・1月は前取り／2月分を 1/10 に
 *
 * ここを間違えると早すぎ＝二重取り・遅すぎ＝取り損ね。日付の式はこのファイルだけに置く。
 * 入会画面の見積り・入会完了メール・Squareのサブスク作成・スタッフの会員カードがすべてこれを通す。
 */

/** 毎月の引き落とし日（この日に「翌月分」を引き落とす） */
export const BILLING_DAY = 10;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** JST日付に月を足す（毎月同日・末日は繰り下げ。例 8/31 + 1か月 = 9/30） */
export function addMonthsYmd(ymd: string, months: number): string {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  // 例 8/31+1か月 → 10/1 になったら 9/30 に繰り下げ
  if (target.getUTCMonth() !== (((d.getUTCMonth() + months) % 12) + 12) % 12) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** 暦の月の差（日にちは見ない）。例 2026-09-30 → 2026-10-01 は 1 */
export function calendarMonthsBetween(fromYmd: string, toYmd: string): number {
  const a = Number(fromYmd.slice(0, 4)) * 12 + Number(fromYmd.slice(5, 7));
  const b = Number(toYmd.slice(0, 4)) * 12 + Number(toYmd.slice(5, 7));
  return b - a;
}

/** その月の1日（"2026-11-02" → "2026-11-01"） */
export function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** "2026-11-01" → "11月" */
export function monthLabel(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}月`;
}

/** その月の分を引き落とす日 ＝ 前月10日。例 "2026-12-01"（12月分）→ "2026-11-10" */
export function chargeDateForMonth(monthYmd: string): string {
  const prev = addMonthsYmd(monthStartYmd(monthYmd), -1);
  return `${prev.slice(0, 7)}-${pad(BILLING_DAY)}`;
}

/** その引き落とし日が「何月分」か ＝ 翌月の1日。例 "2026-11-10" → "2026-12-01" */
export function billedMonthOfChargeDate(chargeYmd: string): string {
  return addMonthsYmd(monthStartYmd(chargeYmd), 1);
}

/** ymd より後（当日は含まない）で最初に来る引き落とし日（10日） */
export function nextChargeDateAfter(ymd: string): string {
  const thisMonth = `${ymd.slice(0, 7)}-${pad(BILLING_DAY)}`;
  return thisMonth > ymd ? thisMonth : addMonthsYmd(thisMonth, 1);
}

/** 引き落とし日（毎月10日）か */
export function isChargeDate(ymd: string): boolean {
  return YMD_RE.test(ymd) && Number(ymd.slice(8, 10)) === BILLING_DAY;
}

/* ============================================================================
 * ご利用開始月（#234）
 *   入会フォームの「ご利用開始日」が先の月なら、無料になるのはその月。それより前の月はかからない。
 *   キャンペーンの6か月継続もご利用開始日から数える（ユーザー決定 2026-09-11）。
 * ========================================================================== */

/** ご利用開始月は、入会月から数えて何か月後の月まで受け付けるか（0=今月、3=3か月後の月） */
export const USAGE_START_MAX_DEFER_MONTHS = 3;

/** ご利用開始日として選べる最終日（入会月から USAGE_START_MAX_DEFER_MONTHS か月後の月の末日） */
export function usageStartMaxYmd(applyDateYmd: string): string {
  const d = new Date(`${monthStartYmd(applyDateYmd)}T12:00:00+09:00`);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + USAGE_START_MAX_DEFER_MONTHS + 1, 0));
  return last.toISOString().slice(0, 10);
}

/**
 * ご利用開始日の入力チェック。問題なければ null、あればお客様/スタッフに見せる文言。
 * 空欄は「入会日から利用」なので null（エラーにしない）。
 */
export function usageStartError(i: { applyDateYmd: string; usageStartYmd: string | null | undefined }): string | null {
  const v = (i.usageStartYmd ?? "").trim();
  if (!v) return null;
  if (!YMD_RE.test(v)) return "ご利用開始日の形式が正しくありません";
  if (v < i.applyDateYmd) return "ご利用開始日は本日以降の日付をお選びください";
  const max = usageStartMaxYmd(i.applyDateYmd);
  if (v > max) return `ご利用開始日は ${max.replaceAll("-", "/")} までの日付をお選びください`;
  return null;
}

export type UsageStartSchedule = {
  /** 入会日 */
  applyDateYmd: string;
  /** ご利用開始日（空欄・過去日は入会日、上限を超えたら上限に丸めたもの） */
  usageStartYmd: string;
  /** 入会月からご利用開始月までの月数（0＝入会月から利用） */
  deferredMonths: number;
  /** 前取り月数 */
  prepaidMonths: number;
  /** 無料になる月（ご利用開始月）の1日 */
  freeMonthYmd: string;
  /** 前取りする月の1日（前取り月数ぶん） */
  prepaidMonthYmds: string[];
  /** 最初に自動で引き落とす月（◯月分）の1日 */
  firstBilledMonthYmd: string;
  /** 最初の自動引き落とし日（= firstBilledMonth の前月10日） */
  nextBillingYmd: string;
  /** ご利用開始日から数えた最低継続の期限 */
  minTermUntilYmd: string;
};

/**
 * 入会日・ご利用開始日・前取り月数から、無料月・前取りの月・最初の自動引き落とし日・継続期限を決める。
 */
export function usageStartSchedule(i: {
  applyDateYmd: string;
  usageStartYmd?: string | null;
  prepaidMonths: number;
  minMonths?: number;
}): UsageStartSchedule {
  const prepaidMonths = Number.isFinite(i.prepaidMonths) ? Math.max(0, Math.trunc(i.prepaidMonths)) : 0;
  const raw = (i.usageStartYmd ?? "").trim();
  let usageStartYmd = YMD_RE.test(raw) && raw > i.applyDateYmd ? raw : i.applyDateYmd;
  const max = usageStartMaxYmd(i.applyDateYmd);
  if (usageStartYmd > max) usageStartYmd = max;
  const deferredMonths = Math.max(0, calendarMonthsBetween(i.applyDateYmd, usageStartYmd));
  const free = monthStartYmd(usageStartYmd);
  const firstBilled = addMonthsYmd(free, prepaidMonths + 1);
  const minMonths = Number.isFinite(i.minMonths) ? Math.max(0, Math.trunc(i.minMonths as number)) : 6;
  return {
    applyDateYmd: i.applyDateYmd,
    usageStartYmd,
    deferredMonths,
    prepaidMonths,
    freeMonthYmd: free,
    prepaidMonthYmds: Array.from({ length: prepaidMonths }, (_, k) => addMonthsYmd(free, k + 1)),
    firstBilledMonthYmd: firstBilled,
    nextBillingYmd: chargeDateForMonth(firstBilled),
    minTermUntilYmd: addMonthsYmd(usageStartYmd, minMonths),
  };
}

/**
 * 前取りが済んでいる会員の「最初の自動引き落とし日」。usageStartSchedule の nextBillingYmd と同じ。
 * 例: 2026-09-10 入会・前取り2か月（10月分・11月分）→ 12月分を 2026-11-10
 */
export function nextBillingDateAfterPrepay(i: {
  startDateYmd: string;
  prepaidMonths: number;
  usageStartYmd?: string | null;
}): string {
  return usageStartSchedule({
    applyDateYmd: i.startDateYmd,
    usageStartYmd: i.usageStartYmd ?? null,
    prepaidMonths: i.prepaidMonths,
  }).nextBillingYmd;
}

/**
 * 保存カードからサブスクを立てるとき（#233・#235）の開始日。
 *
 * - スタッフが日付を指定したら、それが 10日 であること（10日以外は請求日がずれる）
 * - Square は過去日の start_date を受け付けない（受け付けても即時課金）。過ぎていたら
 *   **次に来る10日を候補として返し、人に選び直してもらう**（取りこぼしは店頭で精算。勝手に今日課金しない）
 */
export function resolveBillingStartDate(i: {
  startDateYmd: string;
  prepaidMonths: number;
  todayYmd: string;
  requestedYmd?: string | null;
  usageStartYmd?: string | null;
}):
  | { ok: true; date: string; adjusted: boolean }
  | { ok: false; error: "past_date"; suggested: string }
  | { ok: false; error: "not_billing_day"; suggested: string } {
  const requested = i.requestedYmd && YMD_RE.test(i.requestedYmd) ? i.requestedYmd : null;
  if (requested && !isChargeDate(requested)) {
    // 候補＝指定した月の10日（過ぎていれば次の10日）
    const tenth = `${requested.slice(0, 7)}-${pad(BILLING_DAY)}`;
    return { ok: false, error: "not_billing_day", suggested: tenth >= i.todayYmd ? tenth : nextChargeDateAfter(i.todayYmd) };
  }
  const wanted = requested
    ?? nextBillingDateAfterPrepay({
      startDateYmd: i.startDateYmd,
      prepaidMonths: i.prepaidMonths,
      usageStartYmd: i.usageStartYmd ?? null,
    });
  if (wanted >= i.todayYmd) return { ok: true, date: wanted, adjusted: wanted !== i.requestedYmd };
  let suggested = wanted;
  let guard = 0;
  while (suggested < i.todayYmd && guard++ < 240) suggested = addMonthsYmd(suggested, 1);
  return { ok: false, error: "past_date", suggested };
}

/* ============================================================================
 * 既存のサブスクを「10日払い」に作り直すときの開始日（#235）
 * ========================================================================== */

/**
 * いま持っているサブスクを10日払いに作り直すとき、新しいサブスクの開始日（＝最初の引き落とし日）。
 *
 * - 前取りのある入会（Web入会）: usageStartSchedule の nextBillingYmd（入会日・ご利用開始日・前取り月数から）
 * - 前取りの無いカード登録（会員ページから）: 支払った日より後で最初に来る10日
 *   （登録時の支払いを「次の10日の前の月の分」とみなす）
 *
 * 過ぎた日付になる場合は ok:false（人が判断する。勝手に今日課金しない）。
 */
export function rebaseStartDate(i: {
  joinDateYmd: string;
  usageStartYmd?: string | null;
  prepaidMonths: number;
  todayYmd: string;
  /** 前取りの無い会員のカード登録日（無ければ入会日） */
  registeredYmd?: string | null;
}): { ok: true; date: string; billedMonthYmd: string } | { ok: false; error: "past_date"; date: string } {
  const prepaid = Number.isFinite(i.prepaidMonths) ? Math.max(0, Math.trunc(i.prepaidMonths)) : 0;
  const date = prepaid > 0
    ? usageStartSchedule({ applyDateYmd: i.joinDateYmd, usageStartYmd: i.usageStartYmd ?? null, prepaidMonths: prepaid }).nextBillingYmd
    : nextChargeDateAfter(i.registeredYmd && YMD_RE.test(i.registeredYmd) ? i.registeredYmd : i.joinDateYmd);
  if (date <= i.todayYmd) return { ok: false, error: "past_date", date };
  return { ok: true, date, billedMonthYmd: billedMonthOfChargeDate(date) };
}
