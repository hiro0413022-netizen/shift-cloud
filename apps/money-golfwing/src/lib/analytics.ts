import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { monthRange } from "@/lib/money-util";

/* ============================================================
   売上分析（Money OS /analysis・DECISIONS #58）

   「事業ごと」と「カテゴリごと」で売上を見る。数字の出どころは2つ:
   - 事業別 … fin_entries（財務の正典。月会費予測・キャディ派遣もここに集まる）
   - カテゴリ別 … mon_sales / mon_sales_lines（店頭決済の台帳。品目・支払方法まで分かる）
   ここでは新しい集計ルールを作らない。既存の正典テーブルを読むだけ。
   ============================================================ */

export type MonthValue = { month: string; amount: number };
export type SegmentRow = {
  segment: string;
  amount: number;
  prev: number;
  categories: { name: string; amount: number; isForecast: boolean }[];
};
export type CatRow = { name: string; amount: number; prev: number; count: number };
export type BreakdownRow = { name: string; amount: number; count: number };

export function prevMonth(ym: string, n = 1): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 事業別の売上（fin_entries の収益カテゴリ）。当月・前月・直近12か月推移 */
export async function segmentSales(companyId: string, month: string) {
  const admin = createAdmin();
  const since = `${prevMonth(month, 11)}-01`;
  const until = monthRange(month).to;

  const { data } = await admin
    .from("fin_entries")
    .select("target_month, amount, source, fin_segments(name), fin_categories(name, kind)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("target_month", since)
    .lt("target_month", until);

  type Row = {
    target_month: string;
    amount: number | string;
    source: string | null;
    fin_segments: { name: string } | null;
    fin_categories: { name: string; kind: string } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.fin_categories?.kind === "revenue");

  const cur = month;
  const prv = prevMonth(month);
  const segMap = new Map<string, SegmentRow>();
  const trendMap = new Map<string, number>();

  for (const r of rows) {
    const m = String(r.target_month).slice(0, 7);
    const amt = Number(r.amount);
    trendMap.set(m, (trendMap.get(m) ?? 0) + amt);

    const seg = r.fin_segments?.name ?? "未分類";
    if (!segMap.has(seg)) segMap.set(seg, { segment: seg, amount: 0, prev: 0, categories: [] });
    const s = segMap.get(seg)!;
    if (m === cur) {
      s.amount += amt;
      const catName = r.fin_categories?.name ?? "その他";
      const isForecast = r.source === "forecast";
      const hit = s.categories.find((c) => c.name === catName);
      if (hit) hit.amount += amt;
      else s.categories.push({ name: catName, amount: amt, isForecast });
    }
    if (m === prv) s.prev += amt;
  }

  const segments = [...segMap.values()]
    .filter((s) => s.amount !== 0 || s.prev !== 0)
    .sort((a, b) => b.amount - a.amount);
  for (const s of segments) s.categories.sort((a, b) => b.amount - a.amount);

  const trend: MonthValue[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = prevMonth(month, i);
    trend.push({ month: m, amount: trendMap.get(m) ?? 0 });
  }

  return { segments, trend, total: segments.reduce((a, s) => a + s.amount, 0) };
}

/** 店頭決済のカテゴリ別（mon_sales）。当月・前月 */
export async function categorySales(companyId: string, storeId: string | null, month: string): Promise<CatRow[]> {
  const admin = createAdmin();
  const cur = monthRange(month);
  const prv = monthRange(prevMonth(month));

  let q = admin
    .from("mon_sales")
    .select("sold_on, category, amount")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("sold_on", prv.from)
    .lt("sold_on", cur.to);
  if (storeId) q = q.eq("store_id", storeId);
  const { data } = await q;

  const map = new Map<string, CatRow>();
  for (const r of (data ?? []) as { sold_on: string; category: string; amount: number | string }[]) {
    const inCur = r.sold_on >= cur.from && r.sold_on < cur.to;
    const name = r.category;
    if (!map.has(name)) map.set(name, { name, amount: 0, prev: 0, count: 0 });
    const c = map.get(name)!;
    if (inCur) {
      c.amount += Number(r.amount);
      c.count++;
    } else {
      c.prev += Number(r.amount);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** 台帳明細の内訳（品目→種類 / 支払方法）。当月 */
export async function ledgerBreakdown(companyId: string, storeId: string | null, month: string) {
  const admin = createAdmin();
  const { from, to } = monthRange(month);

  let q = admin
    .from("mon_sales_lines")
    .select("item_category, item_type, maker, amount, pay_method, qty")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("sold_on", from)
    .lt("sold_on", to);
  if (storeId) q = q.eq("store_id", storeId);
  const { data } = await q;

  type L = {
    item_category: string | null;
    item_type: string | null;
    maker: string | null;
    amount: number | string;
    pay_method: string | null;
    qty: number | string | null;
  };
  const lines = (data ?? []) as L[];

  const bump = (m: Map<string, BreakdownRow>, key: string, amt: number, qty: number) => {
    if (!m.has(key)) m.set(key, { name: key, amount: 0, count: 0 });
    const r = m.get(key)!;
    r.amount += amt;
    r.count += qty;
  };

  const retail = new Map<string, BreakdownRow>(); // 物販の種類（シャフト・クラブ…）
  const pay = new Map<string, BreakdownRow>();
  const usage = new Map<string, BreakdownRow>(); // 利用料の内訳（フィッティング・打席利用…）

  for (const l of lines) {
    const amt = Number(l.amount);
    const qty = Number(l.qty ?? 1) || 1;
    if (l.item_category === "販売") bump(retail, l.item_type ?? "その他", amt, qty);
    if (l.item_category === "利用料") bump(usage, l.item_type ?? "その他", amt, qty);
    bump(pay, l.pay_method ?? "不明", amt, 1);
  }

  const top = (m: Map<string, BreakdownRow>) => [...m.values()].sort((a, b) => b.amount - a.amount);
  return { retail: top(retail), usage: top(usage), pay: top(pay), lineCount: lines.length };
}
