// FRANK 会員ポータル / QRチェックイン / モバイルオーダー の純ロジック（#154）
//
// 正典: docs/modules/frank/MEMBER_PORTAL_構想.md
// ここには DB も fetch も置かない（テストできる形に保つ）。DB操作は各アプリ側。

import { createHash, randomBytes } from "node:crypto";

// ---------------------------------------------------------------
// 会員証トークン
// ---------------------------------------------------------------
/**
 * 使う文字は 数字＋英大文字のみ、さらに 0/O・1/I/L を除いた32文字。
 *
 * なぜ記号と小文字を使わないか:
 *   受付のバーコードリーダー(Tera 9200)は USB HIDキーボードとして文字を「打つ」。
 *   既定はUS配列なので、日本語配列のPCに繋ぐと記号が化ける（- / _ \ など）。
 *   数字＋英大文字だけなら配列設定が何であっても化けない。
 *   仮想COM(シリアル)に切り替えても同じく安全なので、後から切り替えても影響しない。
 * なぜ 0/O・1/I/L を抜くか:
 *   スタッフが画面の文字を読んで手入力する場面（リーダー故障時）で誤りやすいため。
 */
export const CHECKIN_TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CHECKIN_TOKEN_LENGTH = 16;

const TOKEN_RE = new RegExp(`^[${CHECKIN_TOKEN_ALPHABET}]{${CHECKIN_TOKEN_LENGTH}}$`);

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
  return TOKEN_RE.test(s) ? s : null;
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

/** 会員として注文しているかで単価が変わる。会員価格は「ログイン済みの会員」だけ。 */
export function unitPriceOf(item: Pick<MenuItem, "price_general" | "price_member">, kind: PriceKind): number {
  return kind === "member" ? item.price_member : item.price_general;
}

export type OrderLineInput = { item: MenuItem; qty: number };
export type OrderLine = { menu_item_id: string; name: string; price_kind: PriceKind; unit_price: number; qty: number; amount: number };

/**
 * 注文明細と合計を組み立てる。
 * 単価と品名は「注文した時点の値」を明細にコピーする＝あとでメニューを改定しても過去の伝票が変わらない。
 */
export function buildOrderLines(inputs: OrderLineInput[], kind: PriceKind): { lines: OrderLine[]; total: number } {
  const lines: OrderLine[] = [];
  for (const { item, qty } of inputs) {
    const q = Math.floor(qty);
    if (!Number.isFinite(q) || q <= 0) continue;
    if (item.sold_out) continue;
    const unit = unitPriceOf(item, kind);
    lines.push({ menu_item_id: item.id, name: item.name, price_kind: kind, unit_price: unit, qty: q, amount: unit * q });
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
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
