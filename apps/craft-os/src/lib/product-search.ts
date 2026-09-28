// product-search.ts — 商品マスタ検索の「言葉の直し」と「並べ方」（純粋関数・DBアクセス禁止）
// tests/craft-product-search.test.ts から直接 import してテストする。
//
// 2026-09-28 ユーザー報告「商品を検索しても引っかからない。reve で探してもリボルバーしか出てこない」
// 原因は2つ:
//   1. 30件で打ち切り＋メーカー名→商品名の順に並べていた。
//      「reve」はメーカー REVE の40品すべてに当たり、アルファベット順で先に来る
//      IMPACT BORON REVOLVER などで30件が埋まって、名前に REVE を含む REVER ASSAULT / ARMORED が画面に出なかった。
//   2. 全角（ｒｅｖｅ）で打つと、半角で登録されたマスタに1件も当たらなかった。
// 直し方:
//   ・言葉は NFKC で全角→半角・小文字にしてから探す（全角で打っても同じ結果）
//   ・DBからは多めに取り、「商品名に当たったもの」を「メーカー名だけに当たったもの」より上に並べる
//   ・画面に出す上限を増やし、打ち切ったときはそう伝える

export type SearchableProduct = { manufacturer: string | null; name: string | null; spec: string | null };

/** 検索語を分ける。全角→半角・小文字、PostgREST の or() を壊す記号は落とす。最大4語 */
export function searchWords(q: string): string[] {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[,()%*\\"']/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 4);
}

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFKC").toLowerCase();

/**
 * すべての言葉が（名前・メーカー・スペックのどこかに）含まれるか。
 * DB 側は半角・全角の両方で ilike しているので、ここで最終判定を1か所にする。
 */
export function matchesAll(p: SearchableProduct, words: string[]): boolean {
  const hay = `${norm(p.name)} ${norm(p.manufacturer)} ${norm(p.spec)}`;
  return words.every((w) => hay.includes(w));
}

/** 当たり方の点数。商品名の頭に当たる > 商品名のどこか > スペック > メーカー名だけ */
export function matchScore(p: SearchableProduct, words: string[]): number {
  const name = norm(p.name);
  const spec = norm(p.spec);
  const maker = norm(p.manufacturer);
  let s = 0;
  for (const w of words) {
    if (name.startsWith(w) || name.split(/[\s/・-]+/).some((t) => t.startsWith(w))) s += 30;
    else if (name.includes(w)) s += 20;
    else if (spec.includes(w)) s += 10;
    else if (maker.includes(w)) s += 5;
  }
  return s;
}

/** 点数の高い順 → メーカー → 名前 */
export function rankProducts<T extends SearchableProduct>(rows: T[], words: string[]): T[] {
  if (words.length === 0) return rows;
  return rows
    .filter((p) => matchesAll(p, words))
    .map((p) => ({ p, s: matchScore(p, words) }))
    .sort(
      (a, b) =>
        b.s - a.s ||
        norm(a.p.manufacturer).localeCompare(norm(b.p.manufacturer)) ||
        norm(a.p.name).localeCompare(norm(b.p.name), "ja", { numeric: true })
    )
    .map((x) => x.p);
}

/** 全角英数字（ＡＢＣ１２３）に直す。マスタに全角で登録された行にも当てるため */
export function toFullWidth(w: string): string {
  return w.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}
