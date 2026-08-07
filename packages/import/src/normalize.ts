// @yozan/import/normalize — 日本語帳票の値の正規化（依存なし）。
// toNumber / parseDate は apps/money-golfwing/src/lib/import/bankCsv.ts からの逐語切り出し
// （tests/bank-csv.test.ts で実運用実績あり）。

/** カンマ・全角数字・引用符を除いて数値化。空は0。 */
export function toNumber(input: string | undefined | null): number {
  if (input == null) return 0;
  let s = String(input).trim().replace(/[",，\s]/g, "");
  if (s === "") return 0;
  // 全角数字→半角
  s = s.replace(/[０-９．－]/g, (c) => "0123456789.-"["０１２３４５６７８９．－".indexOf(c)]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export type DateFormat = "YYYY/MM/DD" | "JP_ERA_YMD";

/** 日付を ISO 'YYYY-MM-DD' へ。対応: 'YYYY/MM/DD' と '2025年9月1日'(JP_ERA_YMD)。 */
export function parseDate(value: string, fmt: DateFormat): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (fmt === "JP_ERA_YMD") {
    const m = v.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (!m) return null;
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  // YYYY/MM/DD (・- 区切りも許容)
  const m = v.replace(/[.\-]/g, "/").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/**
 * 重複防止キー。DB側の unique(company_id, source, dedup_key) と組で使う
 * （bankCsvの規約: 残高あり= code|date|amount|balance / 残高なし= code|date|amount|desc|#occ）。
 */
export function makeDedupKey(parts: ReadonlyArray<string | number | null | undefined>): string {
  return parts.map((p) => String(p ?? "")).join("|");
}
