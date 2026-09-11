/**
 * FRANK 月会費の自動課金を「あとから」立てるときの日付（#233）
 *
 * 発端（2026-09-10・中尾様 FR0047）:
 *   入会の決済でカード会社の3Dセキュア（ワンタイムパスワード）が、お客様がもう使っていない
 *   メールアドレス宛に送られて受信できず、決済リンクを完走できなかった。
 *   店側で Square の顧客にカードを保存し、前取り分は「一回きりの決済」で受領したため、
 *   **入金は済んでいる・会員にもなっている・サブスクだけ無い** という状態が生まれた。
 *
 * その状態から自動課金を立てるとき、開始日を間違えると:
 *   早すぎる → 前取りした月をもう一度請求する（**二重取り**）
 *   遅すぎる → その月をタダにする（**取り損ね**）
 * どちらもそのままお金の事故になるので、日付の式はここ1か所だけに置く。
 *
 * 入会完了メール（apps/genesis/src/lib/frank-join.ts）がお客様に案内している
 * 「次回 ◯月◯日」と**同じ式**であること。ずれるとメールと請求が食い違う。
 */

/** JST日付に月を足す（毎月同日・末日は繰り下げ。例 8/31 + 1か月 = 9/30） */
export function addMonthsYmd(ymd: string, months: number): string {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  // 例 8/31+1か月 → 10/1 になったら 9/30 に繰り下げ
  if (target.getUTCMonth() !== (((d.getUTCMonth() + months) % 12) + 12) % 12) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/**
 * 前取りが済んでいる会員の「次に請求すべき日」。
 *
 * 入会月は無料、そこから prepaidMonths か月ぶんを入会時に前取りしている。
 * したがって次の請求は **入会日 +（前取り月数 + 1）か月**。
 * 例: 2026-09-10 入会・前取り2か月（10月分・11月分）→ 2026-12-10
 */
export function nextBillingDateAfterPrepay(i: {
  startDateYmd: string;
  prepaidMonths: number;
  /** ご利用開始日（#234）。入会月より先の月なら、その月数ぶん後ろにずれる。省略＝入会月から利用 */
  usageStartYmd?: string | null;
}): string {
  return usageStartSchedule({
    applyDateYmd: i.startDateYmd,
    usageStartYmd: i.usageStartYmd ?? null,
    prepaidMonths: i.prepaidMonths,
  }).nextBillingYmd;
}

/**
 * Square に渡してよい開始日か。
 *
 * Square は **過去日**の start_date を受け付けない（受け付けても即時課金になる）。
 * 「前取りが終わった月がもう過ぎている」会員は、その月を自動で取り戻すのではなく
 * **翌月以降を人が選ぶ**（取りこぼしは店頭で精算する）。勝手に今日課金しない。
 */
export function resolveBillingStartDate(i: {
  startDateYmd: string;
  prepaidMonths: number;
  todayYmd: string;
  requestedYmd?: string | null;
  /** ご利用開始日（#234）。nextBillingDateAfterPrepay と同じ */
  usageStartYmd?: string | null;
}): { ok: true; date: string; adjusted: boolean } | { ok: false; error: "past_date"; suggested: string } {
  const wanted = i.requestedYmd && /^\d{4}-\d{2}-\d{2}$/.test(i.requestedYmd)
    ? i.requestedYmd
    : nextBillingDateAfterPrepay({
        startDateYmd: i.startDateYmd,
        prepaidMonths: i.prepaidMonths,
        usageStartYmd: i.usageStartYmd ?? null,
      });
  if (wanted >= i.todayYmd) return { ok: true, date: wanted, adjusted: wanted !== i.requestedYmd };
  // 過ぎている＝人に選び直してもらう。候補として「同じ日付の次に来る月」を返す
  let suggested = wanted;
  let guard = 0;
  while (suggested < i.todayYmd && guard++ < 240) suggested = addMonthsYmd(suggested, 1);
  return { ok: false, error: "past_date", suggested };
}

/* ============================================================================
 * ご利用開始月（#234・2026-09-11）
 *
 * 発端: 尾内様（FR0048）・大江様（FR0049）。9/11 に入会、ご利用開始は 11/2。
 *   入会フォームには「ご利用開始希望日」の欄があったのに、請求はそれを見ていなかった。
 *   → 9月（使わない月）が無料、10月・11月分を前取り、12/11 から自動課金になっていた。
 *
 * ユーザーの決定（2026-09-11）:
 *   - 無料になるのは「ご利用開始月」。前取りはその翌月・翌々月
 *   - ご利用開始月より前の月は、そもそも月会費がかからない
 *   - 毎月の請求日は「入会日と同じ日」のまま（Squareのサブスク作成日＝請求日の基準を動かさない）
 *   - キャンペーンの6か月継続は「ご利用開始日」から数える
 *
 * Square での実現: 入会時の決済でサブスクが「入会日」から始まるので、
 *   自動課金を止める周期数を (入会月→ご利用開始月の月数) + 前取り月数 にするだけ。
 *   例 9/11入会・11/2開始・前取り2か月 → 止める周期 2+2=4（10/11,11/11,12/11,1/11）→ 次回 2/11
 * ========================================================================== */

/** ご利用開始月は、入会月から数えて何か月後の月まで受け付けるか（0=今月、3=3か月後の月） */
export const USAGE_START_MAX_DEFER_MONTHS = 3;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 暦の月の差（日にちは見ない）。例 2026-09-30 → 2026-10-01 は 1 */
export function calendarMonthsBetween(fromYmd: string, toYmd: string): number {
  const a = Number(fromYmd.slice(0, 4)) * 12 + Number(fromYmd.slice(5, 7));
  const b = Number(toYmd.slice(0, 4)) * 12 + Number(toYmd.slice(5, 7));
  return b - a;
}

/** その月の1日（"2026-11-02" → "2026-11-01"） */
function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** ご利用開始日として選べる最終日（入会月から USAGE_START_MAX_DEFER_MONTHS か月後の月の末日） */
export function usageStartMaxYmd(applyDateYmd: string): string {
  const d = new Date(`${monthStart(applyDateYmd)}T12:00:00+09:00`);
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
  /** 入会日（Squareのサブスクが始まる日＝毎月の請求日の基準） */
  applyDateYmd: string;
  /** ご利用開始日（空欄・過去日は入会日、上限を超えたら上限に丸めたもの） */
  usageStartYmd: string;
  /** 入会月からご利用開始月までの月数（0＝入会月から利用） */
  deferredMonths: number;
  /** 前取り月数 */
  prepaidMonths: number;
  /** Squareで自動課金を止める周期数（= deferredMonths + prepaidMonths） */
  pauseCycles: number;
  /** 最初の自動課金日（= 入会日 +（pauseCycles + 1）か月） */
  nextBillingYmd: string;
  /** 無料になる月（ご利用開始月）の1日 */
  freeMonthYmd: string;
  /** 前取りする月の1日（前取り月数ぶん） */
  prepaidMonthYmds: string[];
  /** ご利用開始日から数えた最低継続の期限 */
  minTermUntilYmd: string;
};

/**
 * 入会日・ご利用開始日・前取り月数から、無料月・前取りの月・次回請求日・継続期限を決める。
 * 見積画面（member-os）・決済リンク／Webhook・入会完了メール（genesis）・スタッフの変更操作が
 * すべてこれを通す（ずれると「メールで案内した日」と「実際の請求」が食い違う）。
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
  const pauseCycles = deferredMonths + prepaidMonths;
  const free = monthStart(usageStartYmd);
  const minMonths = Number.isFinite(i.minMonths) ? Math.max(0, Math.trunc(i.minMonths as number)) : 6;
  return {
    applyDateYmd: i.applyDateYmd,
    usageStartYmd,
    deferredMonths,
    prepaidMonths,
    pauseCycles,
    nextBillingYmd: addMonthsYmd(i.applyDateYmd, pauseCycles + 1),
    freeMonthYmd: free,
    prepaidMonthYmds: Array.from({ length: prepaidMonths }, (_, k) => addMonthsYmd(free, k + 1)),
    minTermUntilYmd: addMonthsYmd(usageStartYmd, minMonths),
  };
}

/** "2026-11-01" → "11月" */
export function monthLabel(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}月`;
}
