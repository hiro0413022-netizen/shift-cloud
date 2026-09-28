import "server-only";
import { rangeFacts } from "@/lib/analytics";
import { monthRange } from "@/lib/money-util";
import { buildPivot, defaultSort, explode, filterRows, sortPivotRows, type Pivot } from "@/lib/pivot";
import type { PivotParams } from "@/lib/pivot-params";

export { readParams, toQuery, rangeLabel, jstMonth, type PivotParams } from "@/lib/pivot-params";

/**
 * 集計表（#285）の条件の読み取りと、データの読み込み。画面（/analysis/table）と
 * CSV書き出し（/api/analysis/pivot）で同じものを使う＝画面とExcelで数字がずれない。
 */

/** 集計表に入れない mon_sales の source（実際の取引ではない行） */
export const NOT_TRANSACTIONS = ["ledger", "forecast", "migration", "slack_import"];

export async function loadPivot(
  companyId: string,
  storeId: string | null,
  p: PivotParams,
): Promise<{ pivot: Pivot; categories: string[]; rowCount: number }> {
  const { facts } = await rangeFacts(companyId, storeId, monthRange(p.from).from, monthRange(p.to).to, {
    excludeSources: NOT_TRANSACTIONS,
  });
  const all = explode(facts);
  const categories = [...new Set(all.map((r) => r.category).filter(Boolean))].sort();
  const rows = filterRows(all, { q: p.q, category: p.cat || undefined });
  const pivot = buildPivot(rows, p.rows, p.cols);
  // 列で並べ替えていて、その列が今の表に無ければふつうの並びに戻す
  const colOk = !p.sort.startsWith("col:") || pivot.cols.some((c) => `col:${c.key}` === p.sort);
  const s = colOk ? { sort: p.sort, dir: p.dir } : defaultSort(p.rows);
  pivot.rows = sortPivotRows(pivot, s.sort, s.dir);
  return { pivot, categories, rowCount: rows.length };
}
