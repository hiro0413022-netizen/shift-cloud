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

/* ------------------------------------------------------------
   担当プロ別の売上（コーチ別実績）

   出どころは2つ。どちらも「明細」なので足しても二重計上にならない:
   - mon_sales_lines … Excel売上台帳の日次明細（pro列）。月次ロールアップ後の
     mon_sales(source='ledger') はこの合計なので、こちらは足さない。
   - mon_sales(source='app') … アプリからの手入力（detail.pro）。linesには入らない。
   ------------------------------------------------------------ */

export type ProRow = {
  name: string;
  /** 担当プロ名が空の明細（＝担当なし）か */
  unassigned: boolean;
  amount: number;
  prev: number;
  count: number;
  /** 当月の実人数（お客様名のユニーク数。名前なしは数えない） */
  customers: number;
  cats: BreakdownRow[];
  trend: MonthValue[];
};

/** 売上1明細を担当プロ集計用に正規化したもの */
type ProFact = { m: string; pro: string; amount: number; category: string; customer: string };

/**
 * 同じコーチが別名で入っている分をまとめる（左＝台帳の表記 / 右＝mon_pros の正式名）。
 * 「春馬」は卜部さんの下の名前で、2026-04以降の台帳がこの表記になっている。
 */
const PRO_ALIASES: Record<string, string> = { 春馬: "卜部" };

/**
 * 担当プロ名の表記ゆれを吸収する。
 * - 前後の空白（全角含む）を落とす
 * - 末尾の敬称「プロ」を外す（2025-05以前の台帳は「古川プロ」表記）
 * - 別名を正式名に寄せる
 */
export function normalizePro(raw: string | null | undefined): string {
  let s = String(raw ?? "").replace(/[\s　]+/g, "").trim();
  if (!s) return "";
  if (s.length > 2 && s.endsWith("プロ")) s = s.slice(0, -2);
  return PRO_ALIASES[s] ?? s;
}

export async function proSales(
  companyId: string,
  storeId: string | null,
  month: string,
  months = 6,
): Promise<{ rows: ProRow[]; total: number; trendMonths: string[] }> {
  const admin = createAdmin();
  const since = `${prevMonth(month, months - 1)}-01`;
  const until = monthRange(month).to;

  // ① Excel売上台帳の明細
  let ql = admin
    .from("mon_sales_lines")
    .select("sold_on, pro, amount, item_category, customer_name")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .gte("sold_on", since)
    .lt("sold_on", until);
  if (storeId) ql = ql.eq("store_id", storeId);

  // ② アプリ手入力（ロールアップ済みの ledger 行は除く＝二重計上しない）
  let qs = admin
    .from("mon_sales")
    .select("sold_on, category, amount, customer_name, detail")
    .eq("company_id", companyId)
    .eq("source", "app")
    .is("deleted_at", null)
    .gte("sold_on", since)
    .lt("sold_on", until);
  if (storeId) qs = qs.eq("store_id", storeId);

  const [{ data: lineData }, { data: saleData }] = await Promise.all([ql, qs]);

  type L = { sold_on: string; pro: string | null; amount: number | string; item_category: string | null; customer_name: string | null };
  type S = { sold_on: string; category: string | null; amount: number | string; customer_name: string | null; detail: Record<string, unknown> | null };

  const facts: ProFact[] = [];
  for (const l of (lineData ?? []) as L[]) {
    facts.push({
      m: String(l.sold_on).slice(0, 7),
      pro: normalizePro(l.pro),
      amount: Number(l.amount) || 0,
      category: (l.item_category ?? "").trim() || "その他",
      customer: (l.customer_name ?? "").trim(),
    });
  }
  for (const s of (saleData ?? []) as S[]) {
    facts.push({
      m: String(s.sold_on).slice(0, 7),
      pro: normalizePro(String(s.detail?.pro ?? "")),
      amount: Number(s.amount) || 0,
      category: (s.category ?? "").trim() || "その他",
      customer: (s.customer_name ?? "").trim(),
    });
  }

  const cur = month;
  const prv = prevMonth(month);
  const trendMonths: string[] = [];
  for (let i = months - 1; i >= 0; i--) trendMonths.push(prevMonth(month, i));

  type Acc = { row: ProRow; cats: Map<string, BreakdownRow>; customers: Set<string>; trend: Map<string, number> };
  const acc = new Map<string, Acc>();

  for (const f of facts) {
    const key = f.pro || "";
    if (!acc.has(key)) {
      acc.set(key, {
        row: { name: f.pro || "担当なし", unassigned: !f.pro, amount: 0, prev: 0, count: 0, customers: 0, cats: [], trend: [] },
        cats: new Map(),
        customers: new Set(),
        trend: new Map(),
      });
    }
    const a = acc.get(key)!;
    a.trend.set(f.m, (a.trend.get(f.m) ?? 0) + f.amount);

    if (f.m === cur) {
      a.row.amount += f.amount;
      a.row.count += 1;
      if (f.customer) a.customers.add(f.customer);
      const c = a.cats.get(f.category);
      if (c) { c.amount += f.amount; c.count += 1; }
      else a.cats.set(f.category, { name: f.category, amount: f.amount, count: 1 });
    }
    if (f.m === prv) a.row.prev += f.amount;
  }

  const rows: ProRow[] = [];
  for (const a of acc.values()) {
    a.row.customers = a.customers.size;
    a.row.cats = [...a.cats.values()].sort((x, y) => y.amount - x.amount);
    a.row.trend = trendMonths.map((m) => ({ month: m, amount: a.trend.get(m) ?? 0 }));
    // 当月も前月も推移も全部0なら出さない（過去に一度だけ担当したプロで表が伸びるのを防ぐ）
    if (a.row.amount !== 0 || a.row.prev !== 0 || a.row.trend.some((t) => t.amount !== 0)) rows.push(a.row);
  }
  // 担当なしは最後。それ以外は当月売上の大きい順
  rows.sort((x, y) => (x.unassigned ? 1 : 0) - (y.unassigned ? 1 : 0) || y.amount - x.amount);

  return { rows, total: rows.reduce((s, r) => s + r.amount, 0), trendMonths };
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
