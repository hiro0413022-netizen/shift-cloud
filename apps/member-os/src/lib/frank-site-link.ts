import "server-only";
import { handoffSecret, signHandoff } from "@yozan/core/frank-handoff";

/**
 * 公式サイト（frankgolf.jp）の予約ページへのリンクを作る（#152）
 *
 * 会員ポータルにログイン済みのお客様が「＋ Web予約する」を押したあと、
 * 移動先で **もう一度** 会員番号と電話番号下4桁を求められていた（2026-08-24 ユーザー指摘）。
 * 予約の受付口は公式サイト1か所のまま（#93）にしたいので、
 * 「この会員としてログイン済み」という事実だけを署名付きトークンで持って行く。
 *
 * - トークンの中身は会員番号と期限だけ。電話番号などの個人情報は載せない
 * - 受け取った booking.html は読み取り直後に URL からトークンを消す
 * - 鍵が未設定・仮会員のときはトークンを付けない＝従来どおり入力フォームが出るだけ
 */
export const FRANK_SITE = "https://frankgolf.jp";

export function frankSiteUrl(page: string, memberNo?: string | null): string {
  const base = `${FRANK_SITE}/${page.replace(/^\//, "")}`;
  if (!memberNo) return base;
  const secret = handoffSecret();
  if (!secret) return base;
  return `${base}?t=${encodeURIComponent(signHandoff(memberNo, secret))}`;
}
