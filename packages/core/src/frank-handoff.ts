import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 会員ポータル → 公式サイトの予約ページ への引き渡しトークン（#152）
 *
 * これまで、会員ポータル（member-os）にログイン済みのお客様が「＋ Web予約する」を押すと、
 * 移動先の frankgolf.jp/booking.html で **もう一度** 会員番号と電話番号下4桁を求められていた。
 * 予約の受付口は公式サイト1か所という方針（#93）は変えたくないので、
 * 「ログイン済みである」という事実だけを署名付きで持ち回れるようにする。
 *
 * 設計:
 *  - サーバー同士で共有できる保存先が無い（別Vercelプロジェクト・別ドメイン）ので、
 *    DBに引き換え表を作らず **署名だけで検証できる** 形にした（ステートレス）
 *  - 鍵は両アプリが必ず持っている SUPABASE_SERVICE_ROLE_KEY から派生させる。
 *    FRANK_HANDOFF_SECRET を置けばそちらが優先（鍵の入れ替えができるように）
 *  - 権限は「その会員番号として予約する」だけ。管理操作には一切使えない
 *  - 有効期限は既定6時間。切れたら従来どおり会員番号＋下4桁の入力に戻るだけで、
 *    予約ページが使えなくなることはない
 *
 * ⚠ URLに載るので、受け取った側は history.replaceState で即座にURLから消すこと
 *   （booking.html でそうしている）。中身は会員番号と期限だけで、電話番号は入れない。
 */

/** 既定の有効期限。予約ページで日付を選び直す程度の滞在は十分にまかなえる長さ */
export const HANDOFF_TTL_SEC = 6 * 60 * 60;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * 署名鍵。未設定なら null を返す＝引き渡し機能だけが黙って無効になり、
 * 予約ページは従来の入力フォームにフォールバックする（サイトを落とさない）。
 */
export function handoffSecret(): string | null {
  const base = process.env.FRANK_HANDOFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return base ? `frank-handoff-v1:${base}` : null;
}

function sig(payload: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

/** 会員番号を署名して引き渡しトークンを作る */
export function signHandoff(memberNo: string, secret: string, ttlSec: number = HANDOFF_TTL_SEC): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = b64url(Buffer.from(JSON.stringify({ n: memberNo, e: exp }), "utf8"));
  return `${payload}.${sig(payload, secret)}`;
}

/** 引き渡しトークンを検証して会員番号を返す。不正・期限切れは null */
export function verifyHandoff(token: string, secret: string): string | null {
  if (!token || token.length > 512) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const want = sig(payload, secret);
  // 長さが違うと timingSafeEqual が例外を投げるので先に見る
  if (given.length !== want.length) return null;
  if (!timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(want, "utf8"))) return null;
  try {
    const obj = JSON.parse(unb64url(payload).toString("utf8")) as { n?: unknown; e?: unknown };
    const no = typeof obj.n === "string" ? obj.n : "";
    const exp = typeof obj.e === "number" ? obj.e : 0;
    if (!/^[A-Za-z0-9-]{2,16}$/.test(no)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return no;
  } catch {
    return null;
  }
}
