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
