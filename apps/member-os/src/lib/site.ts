// 公式サイト（sites/frank-golf）へのリンク解決。
// HPの本番ドメインが決まったら SITE_URL に入れると、
// Web入会フォーム等の「会員規約」「プライバシーポリシー」リンクが有効になる。
// 空の間はリンクなしのテキスト表示（同意文言は表示される）。
export const SITE_URL: string = ""; // 例: "https://frank-golf.jp"

export function siteLink(path: string): string | null {
  if (!SITE_URL) return null;
  return `${SITE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export const termsUrl = (): string | null => siteLink("terms.html");
export const privacyUrl = (): string | null => siteLink("privacy.html");
