// @yozan/import/csv — CSVのパースと生成（依存なし・Node/Edge両対応）
//
// parseCsv は apps/money-golfwing/src/lib/import/bankCsv.ts からの逐語切り出し
// （tests/bank-csv.test.ts で実運用実績あり）。既存アプリのコピーは当面そのまま
// （packages/README.md の方針: 移行は1アプリずつ・Vercelビルド確認付き）。

/** 最小CSVパーサ（"..." 内のカンマ・改行に対応）。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** CSVフィールドのエスケープ（lesson-os/survey-os等のexportルートで使っている形と同じ）。 */
export function csvEscape(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/**
 * 行列→CSVテキスト。既定でUTF-8 BOM付き（日本語ヘッダをExcelで開くと文字化けするため）。
 * ダウンロードさせない内部用途は { bom: false }。
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>, opts?: { bom?: boolean }): string {
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  return (opts?.bom === false ? "" : "\uFEFF") + body + "\r\n";
}
