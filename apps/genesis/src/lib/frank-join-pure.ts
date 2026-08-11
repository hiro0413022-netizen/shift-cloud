/**
 * FRANK 入会時の初回一括金額（純粋ロジック・#131b）
 *
 * member-os の frank-billing-pure.ts（joinEstimate）と同じ式。
 * 見積画面（member-os）と実際の決済額（genesis）がズレると事故になるため、
 * tests/frank-join-total.test.ts で両実装の一致を固定している。
 *
 * 決済は「入会時の1回払い」＝ 入会金 ＋ 月会費×前取り月数。
 * 入会月は無料（キャンペーン）。以後の月会費はSquareのサブスクが自動課金する。
 */

export const JOIN_CAMPAIGN_ID = "opening2026";
export const JOIN_CAMPAIGN_UNTIL = "2026-12-31";
export const JOIN_PREPAID_MONTHS = 2; // 入会月無料＋この月数を前取り＝3か月分を確保
export const JOIN_MIN_MONTHS = 6;

export const taxIncluded = (exTax: number) => Math.round(exTax * 1.1);

export function isJoinCampaign(dateYmd: string): boolean {
  return dateYmd <= JOIN_CAMPAIGN_UNTIL;
}

/** 入会時に1回でお支払いいただく合計（税込・円）と内訳 */
export function joinInitialTotal(i: {
  monthlyExTax: number;
  joiningFeeExTax: number;
  applyDateYmd: string;
  joiningFeeWaived?: boolean; // クーポン or キャンペーン
}): { total: number; joiningFee: number; monthly: number; prepaidMonths: number; campaign: boolean } {
  const campaign = isJoinCampaign(i.applyDateYmd);
  const monthly = taxIncluded(i.monthlyExTax);
  const joiningFee = campaign || i.joiningFeeWaived ? 0 : taxIncluded(i.joiningFeeExTax);
  return {
    total: joiningFee + monthly * JOIN_PREPAID_MONTHS,
    joiningFee,
    monthly,
    prepaidMonths: JOIN_PREPAID_MONTHS,
    campaign,
  };
}
