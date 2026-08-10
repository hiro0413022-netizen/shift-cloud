// 住所ユーティリティ（都道府県の分離・郵便番号検索）
// サーバー/クライアント両方から import する。副作用なし。

export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export type Prefecture = (typeof PREFECTURES)[number];

/** 住所文字列の先頭が都道府県名なら切り離す。無ければ prefecture は null。 */
export function splitPrefecture(input: string | null | undefined): {
  prefecture: string | null;
  rest: string;
} {
  const s = (input ?? "").trim();
  if (!s) return { prefecture: null, rest: "" };
  const hit = PREFECTURES.find((p) => s.startsWith(p));
  if (!hit) return { prefecture: null, rest: s };
  return { prefecture: hit, rest: s.slice(hit.length).trim() };
}

/** 都道府県欄が空なら住所から補完して返す（保存直前の安全弁） */
export function normalizeAddress(prefecture: string | null, address: string | null) {
  const pref = (prefecture ?? "").trim();
  if (pref) {
    // 住所側にも都道府県が重複していれば取り除く
    const { prefecture: dup, rest } = splitPrefecture(address);
    return { prefecture: pref, address1: (dup === pref ? rest : (address ?? "").trim()) || null };
  }
  const { prefecture: found, rest } = splitPrefecture(address);
  return { prefecture: found, address1: rest || null };
}

/** 都道府県＋住所＋建物を1行に結合（prefecture列を持たないテーブル用） */
export function joinAddress(...parts: (string | null | undefined)[]): string | null {
  const s = parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
  return s || null;
}

/** 郵便番号を7桁の数字に正規化（全角・ハイフン許容）。7桁でなければ null。 */
export function normalizePostal(zip: string | null | undefined): string | null {
  const digits = (zip ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^\d]/g, "");
  return digits.length === 7 ? digits : null;
}

export type PostalResult = { prefecture: string; city: string };

/** 郵便番号 → 住所（zipcloud・キー不要の公開API）。失敗時は null。 */
export async function lookupPostal(zip: string): Promise<PostalResult | null> {
  const digits = normalizePostal(zip);
  if (!digits) return null;
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`);
    const json = await res.json();
    const r = json?.results?.[0];
    if (!r) return null;
    return {
      prefecture: String(r.address1 ?? ""),
      city: `${r.address2 ?? ""}${r.address3 ?? ""}`,
    };
  } catch {
    return null; // オフライン等は手入力にフォールバック
  }
}
