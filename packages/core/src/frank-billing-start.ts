/**
 * FRANK 月会費の自動課金を「あとから」立てるときの日付（#233）
 *
 * 発端（2026-09-10・中尾様 FR0047）:
 *   入会の決済でカード会社の3Dセキュア（ワンタイムパスワード）が、お客様がもう使っていない
 *   メールアドレスに送られて受信できず、決済リンクを完走できなかった。
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
export function nextBillingDateAfterPrepay(i: { startDateYmd: string; prepaidMonths: number }): string {
  const months = Number.isFinite(i.prepaidMonths) ? Math.max(0, Math.trunc(i.prepaidMonths)) : 0;
  return addMonthsYmd(i.startDateYmd, months + 1);
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
}): { ok: true; date: string; adjusted: boolean } | { ok: false; error: "past_date"; suggested: string } {
  const wanted = i.requestedYmd && /^\d{4}-\d{2}-\d{2}$/.test(i.requestedYmd)
    ? i.requestedYmd
    : nextBillingDateAfterPrepay({ startDateYmd: i.startDateYmd, prepaidMonths: i.prepaidMonths });
  if (wanted >= i.todayYmd) return { ok: true, date: wanted, adjusted: wanted !== i.requestedYmd };
  // 過ぎている＝人に選び直してもらう。候補として「同じ日付の次に来る月」を返す
  let suggested = wanted;
  let guard = 0;
  while (suggested < i.todayYmd && guard++ < 240) suggested = addMonthsYmd(suggested, 1);
  return { ok: false, error: "past_date", suggested };
}
