// FRANK 会員ポータル / QRチェックイン / モバイルオーダー の純ロジック（#154）
//
// 正典: docs/modules/frank/MEMBER_PORTAL_構想.md
// ここには DB も fetch も置かない（テストできる形に保つ）。DB操作は各アプリ側。

import { createHash, randomBytes } from "node:crypto";

import { CHECKIN_TOKEN_ALPHABET, CHECKIN_TOKEN_LENGTH, CHECKIN_TOKEN_RE } from "./frank-token.ts";
import { FRANK_TAX_RATE, taxOf } from "./frank-tax.ts";

// ---------------------------------------------------------------
// 会員証トークン
// ---------------------------------------------------------------
// トークンの文字集合・長さ・形の判定は frank-token.ts（node非依存）に置いてある。
// 画面側（クライアントコンポーネント）からも同じ定義を読ませるため。
export { CHECKIN_TOKEN_ALPHABET, CHECKIN_TOKEN_LENGTH } from "./frank-token.ts";

/** 会員証QRの中身を作る。会員番号(FR0001=連番)は絶対に使わない（他人がQRを自作できるため）。 */
export function newCheckinToken(): string {
  const n = CHECKIN_TOKEN_ALPHABET.length;
  // 256 % 31 != 0 なので、剰余だけだと僅かに偏る。範囲外を捨てて一様にする。
  const limit = Math.floor(256 / n) * n;
  let out = "";
  while (out.length < CHECKIN_TOKEN_LENGTH) {
    for (const b of randomBytes(CHECKIN_TOKEN_LENGTH)) {
      if (b >= limit) continue;
      out += CHECKIN_TOKEN_ALPHABET[b % n];
      if (out.length === CHECKIN_TOKEN_LENGTH) break;
    }
  }
  return out;
}

/**
 * 読み取った文字列をトークンとして受け付けてよいかを判定する唯一の入口。
 *
 * 卓上リーダーは目の前に置かれたものを何でも読む（商品バーコード・他店のQR・
 * 会員証以外のQR）。ここで弾かないと、関係ない文字列でDBを引きに行くことになる。
 * 小文字とスペースだけは救済する（配列設定やコピペのゆらぎ）。
 *
 * @returns 正規化済みトークン。形式が違えば null（＝黙って捨てる）
 */
export function normalizeCheckinScan(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\s　]+/g, "").toUpperCase();
  return CHECKIN_TOKEN_RE.test(s) ? s : null;
}

/** 会員証QRに載せるURL。読み取り機はこの文字列ではなくトークン単体を送る（下の QR は表示用）。 */
export function checkinQrPayload(token: string): string {
  return token;
}

// ---------------------------------------------------------------
// 注文番号
// ---------------------------------------------------------------
/** 伝票の表示番号。例: 0826-014（JSTの月日＋当日連番）。日付が変われば1に戻る。 */
export function orderNo(ymd: string, seq: number): string {
  return `${ymd.slice(5, 7)}${ymd.slice(8, 10)}-${String(seq).padStart(3, "0")}`;
}

// ---------------------------------------------------------------
// 価格
// ---------------------------------------------------------------
export type MenuItem = {
  id: string;
  name: string;
  category: string;
  price_general: number;
  price_member: number;
  sold_out?: boolean | null;
};
export type PriceKind = "general" | "member";

/**
 * メニューの価格は **税抜の本体価格**（#166）。
 *
 * それ以前は price_* を税込として扱ってそのまま課金していた。
 * ユーザー指定で「300円＋消費税」に変更。DBの数値の意味が変わっているので、
 * 価格を触るときは必ずこの前提を確認すること。
 */
/** 会員として注文しているかで単価が変わる。会員価格は「ログイン済みの会員」だけ。 */
export function unitPriceOf(item: Pick<MenuItem, "price_general" | "price_member">, kind: PriceKind): number {
  return kind === "member" ? item.price_member : item.price_general;
}

// 消費税の計算は frank-tax.ts（node非依存）に置いてある。
// 注文画面（クライアント）が同じ計算を読めるようにするため。
export { FRANK_TAX_RATE, taxOf, withTax } from "./frank-tax.ts";

export type OrderLineInput = { item: MenuItem; qty: number };
export type OrderLine = { menu_item_id: string; name: string; price_kind: PriceKind; unit_price: number; qty: number; amount: number };

/**
 * 注文明細と合計を組み立てる。
 * 単価と品名は「注文した時点の値」を明細にコピーする＝あとでメニューを改定しても過去の伝票が変わらない。
 *
 * 明細の unit_price / amount は **税抜**。請求するのは total（税込・#166）。
 */
export function buildOrderLines(
  inputs: OrderLineInput[],
  kind: PriceKind,
  rate: number = FRANK_TAX_RATE,
): { lines: OrderLine[]; subtotal: number; tax: number; taxRate: number; total: number } {
  const lines: OrderLine[] = [];
  for (const { item, qty } of inputs) {
    const q = Math.floor(qty);
    if (!Number.isFinite(q) || q <= 0) continue;
    if (item.sold_out) continue;
    const unit = unitPriceOf(item, kind);
    lines.push({ menu_item_id: item.id, name: item.name, price_kind: kind, unit_price: unit, qty: q, amount: unit * q });
  }
  // 明細は税抜のまま持ち、消費税は**合計に1回だけ**かける。
  // 品目ごとに丸めると、同じものを1個ずつ2回頼んだ人と2個まとめた人で総額がずれる。
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const tax = taxOf(subtotal, rate);
  return { lines, subtotal, tax, taxRate: rate, total: subtotal + tax };
}

/** Square の note に入れる文字列。Webhook 側はこの接頭辞で店内飲食と判定する。 */
export const ORDER_NOTE_PREFIX = "FRANKオーダー";
export function orderNote(no: string): string {
  return `${ORDER_NOTE_PREFIX}#${no}`;
}
/** Webhook 側で note から伝票番号を取り出す。合致しなければ null（＝通常の店頭売上として扱う）。 */
export function parseOrderNote(note: unknown): string | null {
  if (typeof note !== "string") return null;
  const m = note.match(/^FRANKオーダー#([0-9]{4}-[0-9]{3})/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------
// 声かけカード（受付画面にスタッフ向けで出す1〜3行）
// ---------------------------------------------------------------
export type GreetingInput = {
  /** 今日を含まない、これまでの来店回数 */
  pastVisits: number;
  /** 直近の来店日 "YYYY-MM-DD"。初来店なら null */
  lastVisitedOn: string | null;
  /** 今日 "YYYY-MM-DD"（JST） */
  today: string;
  /** 生年月日 "YYYY-MM-DD"。無ければ null */
  birthDate: string | null;
  /** 今日のレッスン開始時刻 "HH:MM" と担当。無ければ null */
  lessonToday?: { startTime: string; coach?: string | null } | null;
  /** 未収金の合計（円）。0 なら出さない */
  unpaidAmount?: number | null;
  /** 会員カードの⚠重要説明事項 */
  importantNote?: string | null;
};

/** 日数差（"YYYY-MM-DD" 同士）。JSTの暦日で数えるので Date のタイムゾーンに依存させない。 */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * スタッフが「名前を呼んで一言かける」ためのネタを作る。
 * 退会予防に一番効くのは声かけで、それを毎回お膳立てするのがこの関数の目的。
 * 出しすぎると読まれないので **最大3行**。順番は「今すぐ困ること → 話題」。
 */
export function greetingLines(input: GreetingInput): string[] {
  const out: string[] = [];

  // 1. 先に伝えないと困るもの
  if (input.importantNote && input.importantNote.trim()) out.push(`⚠ ${input.importantNote.trim()}`);
  if (input.unpaidAmount && input.unpaidAmount > 0) out.push(`未収 ${input.unpaidAmount.toLocaleString("ja-JP")}円 のご案内`);
  if (input.lessonToday) {
    const coach = input.lessonToday.coach ? ` ${input.lessonToday.coach}コーチ` : "";
    out.push(`本日レッスン ${input.lessonToday.startTime}〜${coach}`);
  }

  // 2. 話題
  if (out.length < 3) {
    const visits = input.pastVisits + 1;
    if (input.pastVisits === 0) out.push("はじめてのご来店です");
    else if (visits <= 5) out.push(`${visits}回目のご来店です`);
    else if (visits % 10 === 0) out.push(`${visits}回目のご来店です`);
  }
  if (out.length < 3 && input.lastVisitedOn) {
    const gap = daysBetween(input.lastVisitedOn, input.today);
    if (gap >= 14) out.push(`前回から${gap}日空いています`);
  }
  if (out.length < 3 && input.birthDate && input.birthDate.slice(5, 7) === input.today.slice(5, 7)) {
    out.push(`今月がお誕生月です`);
  }
  return out.slice(0, 3);
}

// ---------------------------------------------------------------
// 打席QR
// ---------------------------------------------------------------
/** 打席に貼るQRのURL。会員/ビジターで分けない（開いた瞬間にログイン状態で判別する）。 */
export function bayQrUrl(portalBaseUrl: string, bayCode: string): string {
  return `${portalBaseUrl.replace(/\/+$/, "")}/bay/${encodeURIComponent(bayCode)}`;
}

/** 会員証QRの再発行などをイベントログに残すときの短い指紋（原文は残さない）。 */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------
// Square の冪等キー
// ---------------------------------------------------------------
/**
 * Square Payments API の idempotency_key の上限（#161・本番で発覚）。
 * `frank-order-`(12) + UUID(36) = 48 で全件 400（Field must not be greater than 45 length）になり、
 * モバイルオーダーの決済が1件も通らなかった。接頭辞を足すときは必ずここを通すこと。
 */
export const SQUARE_IDEMPOTENCY_MAX = 45;

/** 注文IDから Square の冪等キーを作る。同じ注文なら常に同じ値（＝二重課金しない）。 */
export function squareOrderIdempotencyKey(orderId: string): string {
  return `fo-${orderId}`.slice(0, SQUARE_IDEMPOTENCY_MAX);
}

// ---------------------------------------------------------------
// 来店中モードを閉じる判定（#163）
// ---------------------------------------------------------------
/** 予約終了後、これだけは来店中を続ける（片付け・精算の時間）。 */
export const VISIT_GRACE_MIN = 30;

/**
 * 予約が無いチェックイン（ビジター・飛び込み）を来店中にしておく上限。
 *
 * #163 まではここが無く、予約が無い人は **日付が変わるまで来店中のまま**だった。
 * 帰宅後もスマホに打席が出続け、店外から注文画面を開けてしまう。
 * 打席の予約枠が1時間なので、延長1回ぶんを見て2時間にしてある。
 */
export const VISIT_NO_BOOKING_MIN = 120;

/** "HH:MM" を 0:00 からの分に直す。形が違えば null（＝判定に使わない）。 */
export function hhmmToMin(hhmm: string | null | undefined): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * 来店中モードを閉じてよいか。DBには書かない（判定だけで閉じる）。
 *
 * 予約があれば「終了+30分」、無ければ「チェックイン+2時間」で閉じる。
 * どちらも取れないとき（時刻が壊れている等）は **閉じない** ＝ 来店中のままにする。
 * 迷ったら開けておく方が安全で、間違って閉じると来店中のお客様が注文できなくなる。
 */
export function visitClosed(input: {
  nowMin: number;
  endMin: number | null;
  checkedInMin: number | null;
}): boolean {
  const { nowMin, endMin, checkedInMin } = input;
  if (endMin != null) return nowMin > endMin + VISIT_GRACE_MIN;
  if (checkedInMin != null) return nowMin > checkedInMin + VISIT_NO_BOOKING_MIN;
  return false;
}
