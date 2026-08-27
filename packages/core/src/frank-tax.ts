// 消費税の計算（#166）。
//
// なぜ frank-portal.ts から分けたか:
//   frank-portal.ts は node:crypto を読むのでブラウザに持ち込めない。
//   注文画面（クライアント）は「押す前に総額を見せる」ために同じ計算が要る。
//   画面側に税率や丸めをコピーすると、**表示と請求がずれても誰も気づけない**
//   （#161 と同じ壊れ方）。計算は必ずこの1ファイルを通す。
//
// 正典: docs/modules/frank/MEMBER_PORTAL_構想.md

/**
 * 消費税率(%)。打席へお持ちする＝**店内飲食なので10%**。
 * 軽減税率8%は持ち帰りの扱いなので、モバイルオーダーでは使わない。
 * 持ち帰り販売を始めるときは、税率を品目ごとに持つ必要が出る（いまは店全体で1つ）。
 */
export const FRANK_TAX_RATE = 10;

/** 税抜金額にかかる消費税額。端数は切り捨て。 */
export function taxOf(subtotal: number, rate: number = FRANK_TAX_RATE): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  return Math.floor((subtotal * rate) / 100);
}

/**
 * 税込金額。**お客様に見せる金額は必ずこちら**（総額表示義務・消費税法63条）。
 * 税抜だけを大きく出す表示にしないこと。
 */
export function withTax(subtotal: number, rate: number = FRANK_TAX_RATE): number {
  return subtotal + taxOf(subtotal, rate);
}
