import "server-only";
import { rangeFacts } from "@/lib/analytics";
import { monthRange } from "@/lib/money-util";
import { buildPivot, explode, filterRows, isDim, type Dim, type Pivot } from "@/lib/pivot";

/**
 * 集計表（#285）の条件の読み取りと、データの読み込み。画面（/analysis/table）と
 * CSV書き出し（/api/analysis/pivot）で同じものを使う＝画面とExcelで数字がずれない。
 */

export type PivotParams = {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  rows: Dim;
  cols: Dim | null;
  q: string;
  cat: string;
  /** オーナーのみ: all＝全店 / store＝いま選んでいる店舗 */
  scope: "all" | "store";
};

/** 集計表に入れない mon_sales の source（実際の取引ではない行） */
export const NOT_TRANSACTIONS = ["ledger", "forecast", "migration", "slack_import"];

const ymOk = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

export function jstMonth(offset = 0): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function readParams(sp: Record<string, string | undefined>): PivotParams {
  let from = ymOk(sp.from) ? (sp.from as string) : jstMonth(0);
  let to = ymOk(sp.to) ? (sp.to as string) : from;
  if (from > to) [from, to] = [to, from];
  return {
    from,
    to,
    rows: isDim(sp.rows) ? sp.rows : "pro",
    cols: sp.cols && sp.cols !== "none" && isDim(sp.cols) ? sp.cols : null,
    q: String(sp.q ?? "").slice(0, 60),
    cat: String(sp.cat ?? "").slice(0, 40),
    scope: sp.scope === "store" ? "store" : "all",
  };
}

export function toQuery(p: PivotParams): string {
  const u = new URLSearchParams({ from: p.from, to: p.to, rows: p.rows, cols: p.cols ?? "none" });
  if (p.q) u.set("q", p.q);
  if (p.cat) u.set("cat", p.cat);
  if (p.scope === "store") u.set("scope", "store");
  return u.toString();
}

export function rangeLabel(p: PivotParams): string {
  const l = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月`;
  return p.from === p.to ? l(p.from) : `${l(p.from)}〜${l(p.to)}`;
}

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
  return { pivot: buildPivot(rows, p.rows, p.cols), categories, rowCount: rows.length };
}
