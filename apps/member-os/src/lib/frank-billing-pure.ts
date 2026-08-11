/**
 * FRANK GOLF 入会金クーポン＋プラン変更の週割計算（#124・純粋ロジック）
 * DB・fetchに触れない。tests/frank-billing-member.test.ts で固定する。
 */

/** 入会金無料クーポン（2026-08-10 ユーザー指定・6種）。照合は小文字化＋前後空白除去 */
export const JOINING_FEE_COUPONS = ["frankgolft", "fujita", "anada", "ogawa", "furukawa", "hayashi"] as const;

export function normalizeCoupon(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase();
}

/** 有効なクーポンなら正規化済みコードを返す。無効/未入力は null */
export function validCoupon(input: string | null | undefined): string | null {
  const c = normalizeCoupon(input);
  return (JOINING_FEE_COUPONS as readonly string[]).includes(c) ? c : null;
}

/** 税抜→税込（月会費・入会金とも round(×1.1)。genesis側 monthlyFeeTaxIncluded と同式） */
export const taxIncl = (exTax: number) => Math.round(exTax * 1.1);

/* ============================ 入会キャンペーン（#131・2026-08-11 ユーザー指定） ============================
 * - 入会金は 5,500円税込（プランの joining_fee=5,000税抜）。年内（2026-12-31申込分まで）は無料
 * - 月会費は「入会月無料＋翌月・翌々月の2か月分をその場で前取り」
 *   （決済リンクで1か月分＋入金確認後にカードへもう1か月分。以後は毎月入会日と同じ日に自動課金。
 *     前取り分と重ならないよう、サブスクの直近1周期はスキップする）
 * - キャンペーン入会は6か月間の継続が条件（表示・同意記録＋退会時スタッフ警告。強制ブロックはしない）
 */
export const JOIN_CAMPAIGN = {
  id: "opening2026",
  /** この日（JST）までの申込はキャンペーン適用 */
  until: "2026-12-31",
  minMonths: 6,
} as const;

/** キャンペーン適用か（dateYmd=申込日 JST YYYY-MM-DD） */
export function isJoinCampaignActive(dateYmd: string): boolean {
  return dateYmd <= JOIN_CAMPAIGN.until;
}

export type JoinEstimate = {
  campaign: boolean;
  joiningFeeTaxIncluded: number;      // 定価（税込）
  joiningFeeCharged: number;          // 実際の請求額（キャンペーン中0）
  monthlyTaxIncluded: number;         // 月会費（税込）
  prepaidMonths: number;              // 前取り月数（キャンペーン=2）
  firstMonthFree: boolean;
  totalDueNow: number;                // 申込時にお支払いいただく合計（税込）
  minMonths: number;                  // 最低継続（キャンペーン=6、通常0）
};

/** 入会時のお見積り（見積画面・PDF・メールで共通に使う） */
export function joinEstimate(i: {
  monthlyExTax: number;
  joiningFeeExTax: number;
  applyDateYmd: string;
  couponWaivesJoiningFee?: boolean;
}): JoinEstimate {
  const campaign = isJoinCampaignActive(i.applyDateYmd);
  const joiningFeeTaxIncluded = taxIncl(i.joiningFeeExTax);
  const joiningFeeCharged = campaign || i.couponWaivesJoiningFee ? 0 : joiningFeeTaxIncluded;
  const monthlyTaxIncluded = taxIncl(i.monthlyExTax);
  const prepaidMonths = 2; // 3か月分前取り（入会月無料＋2か月分）
  return {
    campaign,
    joiningFeeTaxIncluded,
    joiningFeeCharged,
    monthlyTaxIncluded,
    prepaidMonths,
    firstMonthFree: true,
    totalDueNow: joiningFeeCharged + monthlyTaxIncluded * prepaidMonths,
    minMonths: campaign ? JOIN_CAMPAIGN.minMonths : 0,
  };
}

/**
 * プラン変更の当月差額（週割4分割）。ユーザー決定（2026-08-10）:
 * 「差額を4分割し、変更した週から月末までの残り週数分をその場で請求。翌月から新プラン満額」
 * - 週の数え方: 1〜7日=第1週 / 8〜14日=第2週 / 15〜21日=第3週 / 22日以降=第4週
 * - 残り週数 = 5 - 第n週（第1週=4週分・第4週=1週分）
 * - 値下げ（ダウングレード）は返金しない＝請求0円。翌月から新プラン価格
 * 金額は税込で計算（お客様に請求する額）。1週あたりは round(差額税込/4)。
 */
export function planChangeProration(i: {
  oldMonthlyExTax: number;
  newMonthlyExTax: number;
  jstDayOfMonth: number; // 1〜31
}): { chargeTaxIncluded: number; weeks: number; perWeek: number } {
  const day = Math.min(31, Math.max(1, Math.floor(i.jstDayOfMonth)));
  const weekIndex = Math.min(4, Math.ceil(day / 7));
  const weeks = 5 - weekIndex;
  const diff = taxIncl(i.newMonthlyExTax) - taxIncl(i.oldMonthlyExTax);
  if (diff <= 0) return { chargeTaxIncluded: 0, weeks, perWeek: 0 };
  const perWeek = Math.round(diff / 4);
  return { chargeTaxIncluded: perWeek * weeks, weeks, perWeek };
}
