// Vault（システム台帳）のカテゴリ定義とグループ化。
//
// なぜ切り出したか（2026-08-07の実障害）:
// 画面が CATEGORIES に列挙したカテゴリだけを表示する作りだったため、
// 一覧に無いカテゴリ名（'社内システム' '開発' 'SNS' など、AIや人が自由に入れた値）の行が
// **1件も画面に出ないまま消えていた**（40件中16件）。台帳は「そこに全部ある」ことが価値なので、
// 静かに消えるのは最悪の壊れ方。分類の網羅性に依存しない作りへ変え、純粋関数にしてテストで固定する。

export const VAULT_CATEGORIES: Record<string, string> = {
  site: "サイト/アプリ",
  saas: "SaaS",
  sns: "SNS",
  mail: "メール/ドメイン",
  payment: "決済",
  dev: "開発",
  other: "その他",
};

/**
 * 過去に入力された表記ゆれを正規のキーへ寄せる。
 * DB側も揃えるが、ここでも吸収しておく（次に誰かが日本語カテゴリを入れても消えないように）。
 */
const ALIASES: Record<string, string> = {
  サイト: "site",
  システム: "site",
  社内システム: "site",
  web: "site",
  store: "site",
  アプリ: "site",
  開発: "dev",
  メール: "mail",
  ドメイン: "mail",
  SNS: "sns",
  決済: "payment",
  仕入先サイト: "other",
  その他: "other",
};

/** 表示に使う正規キーへ変換。未知のカテゴリは other に落とす（＝消さない） */
export function normalizeCategory(raw: string | null | undefined): string {
  const c = (raw ?? "").trim();
  if (!c) return "other";
  if (c in VAULT_CATEGORIES) return c;
  const lower = c.toLowerCase();
  if (lower in VAULT_CATEGORIES) return lower;
  return ALIASES[c] ?? ALIASES[lower] ?? "other";
}

export interface CategorizedItem {
  category: string;
}

/**
 * カテゴリごとにまとめる。
 * **入力の全件が必ずどこかのグループに入る**ことが、この関数の唯一かつ最重要の約束。
 */
export function groupByCategory<T extends CategorizedItem>(rows: T[]): { cat: string; label: string; items: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const cat = normalizeCategory(row.category);
    const list = buckets.get(cat);
    if (list) list.push(row);
    else buckets.set(cat, [row]);
  }
  // 表示順は VAULT_CATEGORIES の定義順。定義に無いものは末尾（通常は起きないが保険）
  const order = Object.keys(VAULT_CATEGORIES);
  return [...buckets.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    })
    .map(([cat, items]) => ({ cat, label: VAULT_CATEGORIES[cat] ?? cat, items }));
}
