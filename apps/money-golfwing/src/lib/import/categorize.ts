// categorize.ts — 取込明細の科目提案（非サーバーアクション。UIとactions双方から利用）

export type ImportResult = { ok: number; skipped: number; errors: string[]; source?: string };

/** 摘要キーワードから科目(fin_categories.code)を推測（経理AIに置換予定の暫定ルール） */
export function proposeCategory(desc: string): string {
  const d = (desc ?? "").toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => desc.includes(k) || d.includes(k.toLowerCase()));
  if (has("ENEOS", "エネオス", "出光", "イデミツ", "アポロ", "電気", "ガス", "水道")) return "utility";
  if (has("google", "meta", "facebook", "広告", "ADS")) return "ad";
  if (has("コーナン", "ダイソー", "セブン", "ローソン", "ファミリーマート", "ミニストップ", "文具", "キリン堂")) return "supplies";
  if (has("GENSPARK", "MESHY", "SLACK", "Apple", "iTunes", "お名前", "レンタルサ", "ドメイン", "トランビ")) return "outsourcing";
  if (has("郵便", "クロネコ", "ヤマト", "送料")) return "other_expense";
  return "other_expense";
}
