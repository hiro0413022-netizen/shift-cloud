/**
 * FRANK GOLF のお客様向けリンクの正典（#188）
 *
 * 経緯: メールの中に frankgolf.jp（公式サイト）と member-os-tau.vercel.app（会員ポータル）が
 * 混在していた。お客様から見ると「打席予約はこちら」が2種類あるのと同じで、
 * どちらを開けばいいのか分からない状態だった（2026-09-01 ユーザー指摘）。
 *
 * 決定: **お客様が「入る」ページは my.frankgolf.jp（会員ポータル）に一本化する**。
 * 予約・予約の確認・カルテ・注文・カード登録は全部ここから入る。
 * 公式サイト frankgolf.jp は「これから知る人」が読む場所（コンセプト・料金・アクセス）として残す。
 *
 * ⚠ ここに書いた定数以外の場所にURLを直書きしないこと。
 *   ドメインが2箇所に散ると、片方だけ直して片方が古いままになる（#159 のレジ商品と同じ事故）。
 */

/** 公式サイト（これから知る人が読む場所） */
export const FRANK_SITE = "https://frankgolf.jp";

/**
 * 会員ポータル（お客様の入口はここ1つ）。
 * env で差し替え可能にしてあるのは、プレビュー環境やドメイン移行のため。
 */
export const FRANK_PORTAL =
  (process.env.NEXT_PUBLIC_PORTAL_URL || process.env.FRANK_PORTAL_URL || "https://my.frankgolf.jp").replace(/\/+$/, "");

/** ポータル内のURLを組む（先頭の / は付いていても付いていなくてもよい） */
export function portalUrl(path = ""): string {
  const p = String(path).replace(/^\/+/, "");
  return p ? `${FRANK_PORTAL}/${p}` : FRANK_PORTAL;
}

/** お客様向けリンク集（メール・PDF・LINE はここだけを見る） */
export const FRANK_LINKS = {
  /** 会員ログイン */
  login: portalUrl("member/login"),
  /** 会員ページ（トップ＝会員証QR・これからのご予約） */
  home: portalUrl("member"),
  /** 打席のWeb予約 */
  book: portalUrl("member/book"),
  /** レッスンカルテ */
  karte: portalUrl("member/karte"),
  /** 月会費のカード登録・お手続き */
  settings: portalUrl("member/settings"),
  /** 入会のお申し込み（会員になる前なのでログイン不要） */
  join: portalUrl("join-web"),
  /** 体験レッスンのご予約（会員でない方の入口） */
  trial: `${FRANK_SITE}/trial-booking.html`,
  /** アクセス（情報ページなので公式サイトのまま） */
  access: `${FRANK_SITE}/access.html`,
} as const;

/**
 * 体験予約の確認・キャンセルURL。
 * 実体は公式サイトの trial-booking.html だが、お客様に出すURLはポータル側に寄せる
 * （/cancel/<token> が転送する）＝メールに出るドメインを1つに保つ。
 */
export function trialCancelUrl(token: string): string {
  return portalUrl(`cancel/${encodeURIComponent(token)}`);
}
