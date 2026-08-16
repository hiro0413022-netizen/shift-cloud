import { createHmac, timingSafeEqual } from "crypto";

/**
 * FRANK GOLF Square連携の純粋ロジック（#118）。
 * DB・fetchに触れない部分をここに隔離し、node --test で固定する
 * （#113の教訓: 外部とやり取りする値の組み立て・読み替えはネットワーク無しで検証できる）。
 * サーバー側の本体は frank-pos.ts。
 */

// ------------------------------------------------------------------
// 署名検証（Square: HMAC-SHA256(webhookURL + rawBody) を base64）
// ------------------------------------------------------------------

export function verifySquareSignature(
  rawBody: string,
  sigHeader: string | null,
  signatureKey: string,
  notificationUrl: string,
): boolean {
  if (!sigHeader) return false;
  const expected = createHmac("sha256", signatureKey).update(notificationUrl + rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(sigHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ------------------------------------------------------------------
// マッピング
// ------------------------------------------------------------------

/** Square payment.source_type → Money OS の pay_method 表記 */
export function paySourceLabel(sourceType: string | null | undefined): string {
  switch ((sourceType ?? "").toUpperCase()) {
    case "CASH":
      return "現金";
    case "CARD":
      return "カード";
    case "WALLET":
      return "QR決済";
    case "BANK_ACCOUNT":
      return "振込";
    default:
      return "Square";
  }
}

/** 税込→税抜。Money OS の計算（税込=floor(税抜×1.1)）の逆算なので ceil。
 *  Stripe月会費（unit_amount=round(税抜×1.1)）の逆算にも同じ式を使う（9,800/13,800/19,800で往復一致）。 */
export const exTax = (taxIncluded: number) => Math.ceil(taxIncluded / 1.1);

/** ISO日時 → JSTの日付（sold_on）。UTCのまま切ると前日になる（jst-date-rule） */
export const jstDateOf = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

export type SquarePayment = {
  id?: string;
  status?: string;
  amount_money?: { amount?: number; currency?: string };
  source_type?: string;
  created_at?: string;
  note?: string | null;
  customer_id?: string | null;
  order_id?: string | null;
};

export type MappedSale = {
  sold_on: string;
  category: string;
  amount: number; // 税抜
  tax_included: number; // 税込
  pay_method: string;
  memo: string | null;
  square_payment_id: string;
};

/** COMPLETED した支払いだけを Money OS の売上行へ読み替える。対象外は null */
export function mapSquarePayment(p: SquarePayment): MappedSale | null {
  if (!p?.id || p.status !== "COMPLETED") return null;
  const money = p.amount_money;
  if (!money || typeof money.amount !== "number" || money.amount <= 0) return null;
  if ((money.currency ?? "JPY") !== "JPY") return null;
  const taxIncluded = money.amount; // SquareのJPYは最小単位=円
  return {
    sold_on: jstDateOf(p.created_at ?? new Date().toISOString()),
    category: "利用料", // 内訳が分かる場合はスタッフがMoney OSで修正できる（memoに手掛かりを残す）
    amount: exTax(taxIncluded),
    tax_included: taxIncluded,
    pay_method: paySourceLabel(p.source_type),
    memo: p.note?.trim() ? `Square: ${p.note.trim()}` : "Square店頭決済",
    square_payment_id: p.id,
  };
}

// ------------------------------------------------------------------
// 月会費（Squareサブスク）#123
// ------------------------------------------------------------------

/** 税抜プラン価格→税込請求額。Stripe時代の unit_amount=round(税抜×1.1) と同じ式（9,800/13,800/19,800で exTax と往復一致） */
export const monthlyFeeTaxIncluded = (priceExTax: number) => Math.round(priceExTax * 1.1);

/** 日本の電話番号 → E.164（+81…）。Squareの pre_populated_data 用。変換できなければ null（省略する） */
export function toE164Jp(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("81") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10) return `+81${digits.slice(1)}`;
  return null;
}

/** 入会金の自動課金noteの接頭辞。frank-square-billing.chargeCardOnFile が付け、Webhookがこれで判定する */
export const JOINING_FEE_NOTE_PREFIX = "FRANK入会金";
export const isJoiningFeeNote = (note: string | null | undefined) => (note ?? "").startsWith(JOINING_FEE_NOTE_PREFIX);

/**
 * Web入会 初回一括の payment_note 接頭辞（frank-square-billing.createJoinCheckoutForMember が付ける）。
 * ⚠ "FRANK入会金" と先頭7文字が同じで、8文字目だけで判定が分かれる。文言を変えるときは
 *   isJoiningFeeNote と衝突しないか必ず tests/frank-pos.test.ts で確認すること（#136）。
 */
export const JOIN_CHECKOUT_NOTE_PREFIX = "FRANK入会初回一括";

/**
 * Square払いを「月会費」か「店頭売上」かへ振り分ける。
 * - 決済リンクの注文ID一致＝初回の月会費（金額はリンク作成時にプラン額で固定済み）
 * - 顧客ID一致は、金額がプランの税込月額と一致するときだけ継続課金の月会費と判定する。
 *   （店頭で会員プロフィールを決済に紐付けてドリンク等を買った場合を月会費と誤記録しないため）
 * どちらでもなければ null＝店頭売上として既存のPOS経路へ。
 */
export function classifySquareMonthlyPayment(i: {
  orderMatched: boolean;
  customerMatched: boolean;
  amount: number; // 税込・円
  planTaxIncluded: number | null;
}): "initial" | "recurring" | null {
  if (i.orderMatched) return "initial";
  if (i.customerMatched && i.planTaxIncluded !== null && i.amount === i.planTaxIncluded) return "recurring";
  return null;
}

/**
 * メール一致による初回入金のフォールバック判定（#137）。
 * Squareのサブスク付き決済リンクは、入金 payment が「リンク作成時に控えた order_id」と
 * 別の注文IDで届くことがある（2026-08-15のテスト入会で、注文ID不一致→店頭売上に誤記録）。
 * 注文IDで結べなかったときだけ、
 *   申込中（pending）× 決済リンク発行済（billing_status='checkout'）× メール一致 × 金額が見積どおり
 * の4条件が揃った場合に限り「Web入会の初回入金」と判定する。
 * 金額一致まで要求するのは、同じメールの人が店頭で別の買い物をした決済を入会と誤認しないため。
 */
export function classifyJoinPaymentByEmail(i: {
  emailMatched: boolean;
  memberStatus: string | null;
  billingStatus: string | null;
  amount: number; // 税込・円
  breakdownTotal: number | null; // square_checkout_breakdown.total（決済リンク発行時に確定）
}): boolean {
  return (
    i.emailMatched &&
    i.memberStatus === "pending" &&
    i.billingStatus === "checkout" &&
    i.breakdownTotal !== null &&
    i.breakdownTotal > 0 &&
    i.amount === i.breakdownTotal
  );
}

export type SquareRefund = {
  id?: string;
  status?: string;
  amount_money?: { amount?: number; currency?: string };
  payment_id?: string | null;
  created_at?: string;
  reason?: string | null;
};

export type MappedRefund = {
  sold_on: string;
  category: string;
  amount: number; // 負の税抜
  tax_included: number; // 負の税込
  memo: string | null;
  square_refund_id: string;
};

/** COMPLETED した返金をマイナスの売上行（category=返金）へ */
export function mapSquareRefund(r: SquareRefund): MappedRefund | null {
  if (!r?.id || r.status !== "COMPLETED") return null;
  const money = r.amount_money;
  if (!money || typeof money.amount !== "number" || money.amount <= 0) return null;
  if ((money.currency ?? "JPY") !== "JPY") return null;
  return {
    sold_on: jstDateOf(r.created_at ?? new Date().toISOString()),
    category: "返金",
    amount: -exTax(money.amount),
    tax_included: -money.amount,
    memo: r.reason?.trim() ? `Square返金: ${r.reason.trim()}` : "Square返金",
    square_refund_id: r.id,
  };
}
