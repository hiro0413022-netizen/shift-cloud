// @yozan/import/table — ヘッダ行つき表の列マッピング補助。
// bankCsv の「header.indexOf(列名)」パターンの一般化。列名→値の対応だけを共通化し、
// どの列を何に使うか（マッピング定義）はアプリ側に残す（MODULARIZATION_PLANの方針）。

/** ヘッダ配列から「列名→index」引きを作る。無い列は -1。 */
export function headerIndex(header: ReadonlyArray<string>): (name?: string | null) => number {
  const trimmed = header.map((h) => h.trim());
  return (name?: string | null) => (name ? trimmed.indexOf(name) : -1);
}

/**
 * 表（parseCsvの結果）をヘッダ行でRecord化する。
 * headerRow より上の行は捨てる（銀行CSVの前置き行対応）。空行はスキップ。
 */
export function tableToRecords(
  table: ReadonlyArray<ReadonlyArray<string>>,
  headerRow = 0,
): { header: string[]; records: Record<string, string>[] } {
  const header = (table[headerRow] ?? []).map((h) => h.trim());
  const records: Record<string, string>[] = [];
  for (let i = headerRow + 1; i < table.length; i++) {
    const row = table[i] ?? [];
    if (row.every((c) => (c ?? "").trim() === "")) continue;
    const rec: Record<string, string> = {};
    header.forEach((h, j) => {
      if (h) rec[h] = row[j] ?? "";
    });
    records.push(rec);
  }
  return { header, records };
}
