import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";
import type { Actor } from "@/lib/auth";
import {
  countClubs,
  computeFittingRefund,
  priceQuote,
  REFUND_CAP,
  type DiscountRule,
  type MemberKind,
  type QuoteItemInput,
  type Segment,
} from "@yozan/core/fitting-quote";

/**
 * craft-os のデータ層。
 *
 * ★ 定価は持たない。gw_products（＝発注管理の商品マスタ golfwing.products の読み取りビュー）を引く。
 * ★ 金額の計算は @yozan/core/fitting-quote 1か所。ここでは「読んで渡す」だけにする。
 * ★ 会社・店舗の絞り込みは必ずサーバー側で入れる（UI非表示に頼らない #128/#134）。
 */

export const FITTING_MENUS = [
  "シャフトフルフィッティング",
  "シャフトフィッティング",
  "ボールフィッティング",
] as const;

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "作成中",
  reviewed: "社内確認済み",
  presented: "お客様へ提示済み",
  accepted: "ご注文",
  ordered: "発注済み",
  void: "取消",
};

export const WORK_STEPS = [
  { key: "ordered_on", label: "発注" },
  { key: "arrived_on", label: "到着" },
  { key: "assembled_on", label: "組立" },
  { key: "reve_sent_on", label: "REVE送信" },
  { key: "delivered_on", label: "お渡し" },
  { key: "td_on", label: "TD" },
  { key: "paid_on", label: "お支払い" },
] as const;

export type Quote = {
  id: number;
  company_id: string;
  store_id: string | null;
  quote_seq: number;
  quote_no: string;
  guest_id: string | null;
  customer_name: string;
  customer_contact: string | null;
  member_kind: MemberKind;
  segment: Segment;
  walkin_visit_id: string | null;
  res_request_id: string | null;
  /** 表紙。NULL＝フィッティングを伴わない伝票（グリップ交換だけ等） */
  fitting_id: number | null;
  seq_year: number;
  /** 御見積書を発行した日時。NULL＝注文書だけで完結した伝票 */
  quote_issued_at: string | null;
  quote_date: string;
  subject: string;
  delivery_note: string;
  payment_terms: string;
  validity_note: string;
  staff_name: string | null;
  tax_rate: number;
  tax_free_amount: number;
  prepaid_amount: number;
  refund_amount: number;
  refund_auto: boolean;
  refund_note: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

/**
 * 表紙。フィッティング時にお客様へお渡しする紙。
 * 伝票（見積／注文）とは別物で、グリップ交換だけのときは存在しない。
 * 逆に1回のフィッティングから伝票が複数に分かれることもある。
 */
export type Fitting = {
  id: number;
  company_id: string;
  store_id: string | null;
  seq_year: number;
  fitting_seq: number;
  fitting_no: string;
  guest_id: string | null;
  customer_name: string;
  customer_contact: string | null;
  member_kind: MemberKind;
  segment: Segment;
  walkin_visit_id: string | null;
  res_request_id: string | null;
  fitting_date: string;
  fitter_staff_id: string | null;
  fitter_name: string | null;
  fitting_menu: string | null;
  fitting_minutes: number | null;
  note: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
};

export const FITTING_STATUS_LABELS: Record<string, string> = {
  open: "フィッティング済み",
  quoted: "伝票あり",
  closed: "完了",
  void: "取消",
};

export type QuoteItem = QuoteItemInput & {
  id: number;
  quote_id: number;
  line_no: number;
  demo_no: number | null;
  product_id: number | null;
  labor_rate_id: number | null;
  product_name: string;
  spec: string | null;
  finish_length_inch: number | null;
  discount_rate: number | null;
  discount_reason: string | null;
  discount_by: string | null;
  discount_at: string | null;
  note: string | null;
};

export type WorkOrder = {
  id: number;
  quote_id: number;
  order_seq: number;
  order_no: string;
  order_date: string;
  due_date: string | null;
  ordered_on: string | null;
  arrived_on: string | null;
  assembled_on: string | null;
  reve_sent_on: string | null;
  delivered_on: string | null;
  td_on: string | null;
  paid_on: string | null;
  assembled_by: string | null;
  assembled_by_name: string | null;
  reve_color: string | null;
  reve_serial: string | null;
  purchase_order_id: number | null;
  sales_posted_at: string | null;
  status: string;
  note: string | null;
};

export type WorkSpec = {
  id: number;
  work_order_id: number;
  line_no: number;
  priority: number | null;
  quote_item_id: number | null;
  head_product_id: number | null;
  head_name: string | null;
  cpm_min: number | null;
  cpm_max: number | null;
  balance_min: string | null;
  balance_max: string | null;
  length_min: number | null;
  length_max: number | null;
  weight_min: number | null;
  weight_max: number | null;
  head_weight: number | null;
  screw: string | null;
  grip_layers: string | null;
  grip_wrap: string | null;
  sleeve_source: string | null;
  sleeve_position: string | null;
  spec_note: string | null;
  actual_cpm: number | null;
  actual_balance: string | null;
  actual_length: number | null;
  actual_weight: number | null;
  actual_head_weight: number | null;
  actual_note: string | null;
  measured_at: string | null;
  measured_by: string | null;
};

export type ProductRow = {
  id: number;
  item_category: string | null;
  manufacturer: string | null;
  name: string;
  spec: string | null;
  club_type: string | null;
  list_price: number | null;
  default_rate: number | null;
  unit: string | null;
};

export type DemoShaftRow = {
  id: number;
  demo_no: number;
  product_id: number | null;
  shelf: string | null;
  club_type: string | null;
  status: string;
  import_name: string | null;
  import_maker: string | null;
  import_price: number | null;
  match_status: string;
  match_note: string | null;
  note: string | null;
};

const db = () => createAdmin();

// ---------------------------------------------------------------------------
// マスタ
// ---------------------------------------------------------------------------

export async function getDiscountRules(actor: Actor): Promise<DiscountRule[]> {
  const { data } = await db()
    .from("gw_discount_rules")
    .select("id, item_category, manufacturer, segment, member_kind, rate, priority, note, is_active, effective_from, effective_to")
    .eq("company_id", actor.companyId)
    .eq("is_active", true);
  return (data ?? []).map((r) => ({ ...r, rate: Number(r.rate) })) as DiscountRule[];
}

export type LaborRate = {
  id: number;
  code: string;
  name: string;
  price: number | null;
  price_bring_in: number | null;
  price_no_purchase: number | null;
  unit: string;
  quote_section: string;
  discount_category: string;
  price_note: string | null;
  sort_order: number;
};

export async function getLaborRates(actor: Actor): Promise<LaborRate[]> {
  const { data } = await db()
    .from("gw_labor_rates")
    .select("id, code, name, price, price_bring_in, price_no_purchase, unit, quote_section, discount_category, price_note, sort_order")
    .eq("company_id", actor.companyId)
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as LaborRate[];
}

// ---------------------------------------------------------------------------
// 試打シャフト台帳
// ---------------------------------------------------------------------------

export type DemoLookup = DemoShaftRow & { product: ProductRow | null };

/** 試打NOから商品を引く。台帳に無い番号・商品未紐づけの番号も、理由つきで返す */
export async function lookupDemoShafts(actor: Actor, demoNos: number[]): Promise<Map<number, DemoLookup>> {
  const out = new Map<number, DemoLookup>();
  const nos = [...new Set(demoNos.filter((n) => Number.isFinite(n) && n > 0))];
  if (nos.length === 0) return out;

  const { data: shafts } = await db()
    .from("gw_demo_shafts")
    .select("id, demo_no, product_id, shelf, club_type, status, import_name, import_maker, import_price, match_status, match_note, note")
    .eq("company_id", actor.companyId)
    .in("demo_no", nos);

  const rows = (shafts ?? []) as DemoShaftRow[];
  const productIds = rows.map((r) => r.product_id).filter((v): v is number => v != null);
  const products = await getProducts(actor, productIds);

  for (const r of rows) {
    out.set(r.demo_no, { ...r, product: r.product_id ? products.get(r.product_id) ?? null : null });
  }
  return out;
}

export async function getProducts(actor: Actor, ids: number[]): Promise<Map<number, ProductRow>> {
  const out = new Map<number, ProductRow>();
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return out;
  const { data } = await db()
    .from("gw_products")
    .select("id, item_category, manufacturer, name, spec, club_type, list_price, default_rate, unit")
    .eq("company_id", actor.companyId)
    .in("id", uniq);
  for (const p of (data ?? []) as ProductRow[]) out.set(p.id, { ...p, list_price: p.list_price == null ? null : Number(p.list_price) });
  return out;
}

/** 商品マスタの検索。マスタに無いものは手入力行で入れられるので、ここは「探しやすさ」だけを見る */
export async function searchProducts(
  actor: Actor,
  q: string,
  opts: { category?: string | null; limit?: number } = {}
): Promise<ProductRow[]> {
  const term = q.trim();
  if (term.length < 1) return [];
  let query = db()
    .from("gw_products")
    .select("id, item_category, manufacturer, name, spec, club_type, list_price, default_rate, unit")
    .eq("company_id", actor.companyId)
    .eq("is_active", true)
    .limit(opts.limit ?? 30);
  if (opts.category) query = query.eq("item_category", opts.category);
  // 空白区切りのすべてを含む、で絞る（「ベンタス 6S」のような引き方）
  for (const word of term.split(/[\s　]+/).filter(Boolean).slice(0, 4)) {
    query = query.or(`name.ilike.%${word}%,manufacturer.ilike.%${word}%,spec.ilike.%${word}%`);
  }
  const { data } = await query.order("manufacturer").order("name");
  return ((data ?? []) as ProductRow[]).map((p) => ({ ...p, list_price: p.list_price == null ? null : Number(p.list_price) }));
}

export type DemoShaftStats = {
  total: number;
  matched: number;
  needsReview: number;
  unmatched: number;
  noShelf: number;
  haiban: number;
};

export async function getDemoShaftStats(actor: Actor): Promise<DemoShaftStats> {
  const base = () => db().from("gw_demo_shafts").select("id", { count: "exact", head: true }).eq("company_id", actor.companyId);
  const [total, matched, needsReview, unmatched, noShelf, haiban] = await Promise.all([
    base(),
    base().eq("match_status", "matched"),
    base().eq("match_status", "needs_review"),
    base().eq("match_status", "unmatched"),
    base().is("shelf", null),
    base().eq("status", "廃盤"),
  ]);
  return {
    total: total.count ?? 0,
    matched: matched.count ?? 0,
    needsReview: needsReview.count ?? 0,
    unmatched: unmatched.count ?? 0,
    noShelf: noShelf.count ?? 0,
    haiban: haiban.count ?? 0,
  };
}

export async function listDemoShafts(
  actor: Actor,
  opts: { status?: string | null; q?: string | null; shelf?: string | null; limit?: number } = {}
): Promise<(DemoShaftRow & { product: ProductRow | null })[]> {
  let query = db()
    .from("gw_demo_shafts")
    .select("id, demo_no, product_id, shelf, club_type, status, import_name, import_maker, import_price, match_status, match_note, note")
    .eq("company_id", actor.companyId)
    .order("demo_no")
    .limit(opts.limit ?? 200);
  if (opts.status) query = query.eq("match_status", opts.status);
  if (opts.shelf) query = query.eq("shelf", opts.shelf);
  if (opts.q) {
    const t = opts.q.trim();
    if (/^\d+$/.test(t)) query = query.eq("demo_no", Number(t));
    else query = query.or(`import_name.ilike.%${t}%,import_maker.ilike.%${t}%`);
  }
  const { data } = await query;
  const rows = (data ?? []) as DemoShaftRow[];
  const products = await getProducts(actor, rows.map((r) => r.product_id).filter((v): v is number => v != null));
  return rows.map((r) => ({ ...r, product: r.product_id ? products.get(r.product_id) ?? null : null }));
}

// ---------------------------------------------------------------------------
// お客様（受付台帳 mbr_guests）
// ---------------------------------------------------------------------------

export type GuestRow = {
  id: string;
  name: string | null;
  name_kana: string | null;
  phone: string | null;
  mobile: string | null;
};

/**
 * お名前でお客様を探す。6,261人から選ぶだけにして、毎回書かせない。
 * 表記ゆれ（姓だけ・カナ・空白あり/なし）は app.kana に寄せる前段として、まず単純一致で拾う。
 */
export async function searchGuests(actor: Actor, q: string, limit = 12): Promise<GuestRow[]> {
  const t = q.trim();
  if (t.length < 1) return [];
  const bare = t.replace(/[\s　]/g, "");
  const { data } = await db()
    .from("mbr_guests")
    .select("id, name, name_kana, phone, mobile")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .or(`name.ilike.%${t}%,name.ilike.%${bare}%,name_kana.ilike.%${t}%,name_kana.ilike.%${bare}%,phone.ilike.%${bare}%,mobile.ilike.%${bare}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as GuestRow[];
}

// ---------------------------------------------------------------------------
// 見積
// ---------------------------------------------------------------------------

export type QuoteListRow = Quote & {
  work: Pick<WorkOrder, "id" | "order_no" | "due_date" | "ordered_on" | "arrived_on" | "assembled_on" | "delivered_on" | "paid_on" | "status"> | null;
  fitting: Pick<Fitting, "id" | "fitting_no" | "fitting_date" | "fitting_minutes" | "fitter_name"> | null;
  itemCount: number;
  total: number;
};

function toItemInput(it: QuoteItem): QuoteItemInput {
  return {
    line_no: it.line_no,
    line_kind: it.line_kind,
    item_category: it.item_category,
    manufacturer: it.manufacturer,
    club_type: it.club_type,
    list_price: Number(it.list_price ?? 0),
    quantity: it.quantity,
    tax_free: it.tax_free,
    supplier_rate: it.supplier_rate,
    discount_manual: it.discount_manual,
    discount_rate: it.discount_rate,
    discount_amount: it.discount_amount == null ? null : Number(it.discount_amount),
  };
}

/**
 * 伝票を計算にかけるための入力。
 *
 * ★ フィッティング時間は表紙から来る（伝票は持たない）。表紙が無ければ返金も無い。
 * ★ 返金の上限は表紙ごと。同じ表紙の、先に作られた伝票が使った額を alreadyUsed で渡す。
 */
function toQuoteInput(
  q: Quote,
  ctx: { fittingMinutes?: number | null; alreadyUsed?: number | null } = {},
) {
  return {
    segment: q.segment,
    memberKind: q.member_kind,
    fittingMinutes: ctx.fittingMinutes ?? null,
    refundAlreadyUsed: ctx.alreadyUsed ?? 0,
    taxRate: Number(q.tax_rate),
    taxFreeAmount: Number(q.tax_free_amount),
    prepaidAmount: Number(q.prepaid_amount),
    refundOverride: q.refund_auto ? null : Number(q.refund_amount),
    onDate: q.quote_date,
  };
}

/**
 * 表紙ごとの返金の使用状況。
 * 「先に作られた伝票から順に枠を使う」と決めている（伝票 id の昇順）。
 */
export type RefundUsage = Map<number, { quoteId: number; amount: number }[]>;

async function getRefundUsage(actor: Actor, fittingIds: number[]): Promise<RefundUsage> {
  const out: RefundUsage = new Map();
  const ids = [...new Set(fittingIds.filter((n): n is number => n != null))];
  if (ids.length === 0) return out;
  const { data } = await db()
    .from("gw_quotes")
    .select("id, fitting_id, refund_amount")
    .eq("company_id", actor.companyId)
    .in("fitting_id", ids)
    .is("deleted_at", null)
    .neq("status", "void")
    .order("id");
  for (const r of (data ?? []) as { id: number; fitting_id: number; refund_amount: number | string }[]) {
    const list = out.get(r.fitting_id) ?? [];
    list.push({ quoteId: r.id, amount: Number(r.refund_amount ?? 0) });
    out.set(r.fitting_id, list);
  }
  return out;
}

/** この伝票より前に、同じ表紙で使われた返金額 */
function usedBefore(usage: RefundUsage, fittingId: number | null, quoteId: number): number {
  if (!fittingId) return 0;
  return (usage.get(fittingId) ?? [])
    .filter((r) => r.quoteId < quoteId)
    .reduce((a, b) => a + b.amount, 0);
}

async function getFittingsByIds(actor: Actor, ids: number[]): Promise<Map<number, Fitting>> {
  const out = new Map<number, Fitting>();
  const uniq = [...new Set(ids.filter((n): n is number => n != null))];
  if (uniq.length === 0) return out;
  const { data } = await db()
    .from("gw_fittings")
    .select("*")
    .eq("company_id", actor.companyId)
    .in("id", uniq)
    .is("deleted_at", null);
  for (const f of (data ?? []) as Fitting[]) out.set(f.id, f);
  return out;
}

export async function listQuotes(
  actor: Actor,
  opts: { status?: string | null; q?: string | null; fittingId?: number | null; limit?: number } = {},
): Promise<QuoteListRow[]> {
  let query = db()
    .from("gw_quotes")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("quote_date", { ascending: false })
    .order("quote_seq", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.fittingId) query = query.eq("fitting_id", opts.fittingId);
  if (opts.q) query = query.ilike("customer_name", `%${opts.q.trim()}%`);
  const { data } = await query;
  const quotes = (data ?? []) as Quote[];
  const visible = quotes.filter((q) => actor.isOwner || !q.store_id || actor.storeIds.includes(q.store_id));
  if (visible.length === 0) return [];

  const ids = visible.map((q) => q.id);
  const fittingIds = visible.map((q) => q.fitting_id).filter((v): v is number => v != null);
  const [{ data: items }, { data: works }, rules, fittings, usage] = await Promise.all([
    db().from("gw_quote_items").select("*").in("quote_id", ids),
    db().from("gw_work_orders").select("*").in("quote_id", ids).is("deleted_at", null),
    getDiscountRules(actor),
    getFittingsByIds(actor, fittingIds),
    getRefundUsage(actor, fittingIds),
  ]);

  const itemsBy = new Map<number, QuoteItem[]>();
  for (const it of (items ?? []) as QuoteItem[]) {
    const list = itemsBy.get(it.quote_id) ?? [];
    list.push(it);
    itemsBy.set(it.quote_id, list);
  }
  const workBy = new Map<number, WorkOrder>();
  for (const w of (works ?? []) as WorkOrder[]) workBy.set(w.quote_id, w);

  return visible.map((q) => {
    const its = itemsBy.get(q.id) ?? [];
    const f = q.fitting_id ? fittings.get(q.fitting_id) ?? null : null;
    const priced = priceQuote(
      its.map(toItemInput),
      toQuoteInput(q, { fittingMinutes: f?.fitting_minutes, alreadyUsed: usedBefore(usage, q.fitting_id, q.id) }),
      rules,
    );
    return {
      ...q,
      work: workBy.get(q.id) ?? null,
      fitting: f
        ? { id: f.id, fitting_no: f.fitting_no, fitting_date: f.fitting_date, fitting_minutes: f.fitting_minutes, fitter_name: f.fitter_name }
        : null,
      itemCount: its.length,
      total: priced.totals.total,
    };
  });
}

export type Trial = {
  id: number;
  fitting_id: number;
  line_no: number;
  demo_no: number | null;
  product_id: number | null;
  head_name: string | null;
  memo: string | null;
  picked: boolean;
};

export type TrialRow = Trial & { product: ProductRow | null; shelf: string | null; demoNote: string | null };

/** 試打の行に、商品マスタの内容と棚番号を添える（定価はここでも持たない） */
async function decorateTrials(actor: Actor, rows: Trial[]): Promise<TrialRow[]> {
  const demoMap = await lookupDemoShafts(actor, rows.map((t) => t.demo_no ?? 0));
  const extraProducts = await getProducts(actor, rows.map((t) => t.product_id).filter((v): v is number => v != null));
  return rows.map((t) => {
    const d = t.demo_no != null ? demoMap.get(t.demo_no) ?? null : null;
    return {
      ...t,
      product: (t.product_id ? extraProducts.get(t.product_id) : null) ?? d?.product ?? null,
      shelf: d?.shelf ?? null,
      demoNote: d ? null : t.demo_no != null ? "この番号は試打台帳にありません" : null,
    };
  });
}

// ---------------------------------------------------------------------------
// 表紙
// ---------------------------------------------------------------------------

export type FittingListRow = Fitting & { quoteCount: number; refundUsed: number };

export async function listFittings(
  actor: Actor,
  opts: { q?: string | null; limit?: number } = {},
): Promise<FittingListRow[]> {
  let query = db()
    .from("gw_fittings")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("fitting_date", { ascending: false })
    .order("fitting_seq", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.q) query = query.ilike("customer_name", `%${opts.q.trim()}%`);
  const { data } = await query;
  const rows = ((data ?? []) as Fitting[]).filter((f) => actor.isOwner || !f.store_id || actor.storeIds.includes(f.store_id));
  if (rows.length === 0) return [];
  const usage = await getRefundUsage(actor, rows.map((f) => f.id));
  return rows.map((f) => {
    const list = usage.get(f.id) ?? [];
    return { ...f, quoteCount: list.length, refundUsed: list.reduce((a, b) => a + b.amount, 0) };
  });
}

export type FullFitting = {
  fitting: Fitting;
  trials: TrialRow[];
  quotes: QuoteListRow[];
  /** この表紙で既に返金した合計と、返金の枠 */
  refund: { cap: number; used: number; remaining: number };
};

export async function getFitting(actor: Actor, id: number): Promise<FullFitting | null> {
  const { data } = await db()
    .from("gw_fittings")
    .select("*")
    .eq("company_id", actor.companyId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const fitting = data as Fitting;
  if (!actor.isOwner && fitting.store_id && !actor.storeIds.includes(fitting.store_id)) return null;

  const [{ data: trialRows }, quotes] = await Promise.all([
    db().from("gw_fitting_trials").select("*").eq("fitting_id", id).order("line_no"),
    listQuotes(actor, { fittingId: id, limit: 50 }),
  ]);
  const trials = await decorateTrials(actor, (trialRows ?? []) as Trial[]);

  const cap = fitting.fitting_minutes ? REFUND_CAP[fitting.fitting_minutes as 55 | 110] ?? 0 : 0;
  const used = quotes.filter((q) => q.status !== "void").reduce((a, q) => a + Number(q.refund_amount ?? 0), 0);
  return { fitting, trials, quotes, refund: { cap, used, remaining: Math.max(0, cap - used) } };
}

// ---------------------------------------------------------------------------
// 伝票（見積／注文）
// ---------------------------------------------------------------------------

export type FullQuote = {
  quote: Quote;
  /** 紐づいた表紙。NULL＝フィッティングを伴わない伝票 */
  fitting: Fitting | null;
  /** 同じ表紙で、この伝票より先に使われた返金額 */
  refundUsedBefore: number;
  items: QuoteItem[];
  work: WorkOrder | null;
  specs: WorkSpec[];
  rules: DiscountRule[];
  priced: ReturnType<typeof priceQuote>;
};

export async function getQuote(actor: Actor, id: number): Promise<FullQuote | null> {
  const { data } = await db()
    .from("gw_quotes")
    .select("*")
    .eq("company_id", actor.companyId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const quote = data as Quote;
  if (!actor.isOwner && quote.store_id && !actor.storeIds.includes(quote.store_id)) return null;

  const [{ data: items }, { data: work }, rules, fittings, usage] = await Promise.all([
    db().from("gw_quote_items").select("*").eq("quote_id", id).order("line_no"),
    db().from("gw_work_orders").select("*").eq("quote_id", id).is("deleted_at", null).maybeSingle(),
    getDiscountRules(actor),
    getFittingsByIds(actor, quote.fitting_id ? [quote.fitting_id] : []),
    getRefundUsage(actor, quote.fitting_id ? [quote.fitting_id] : []),
  ]);

  const fitting = quote.fitting_id ? fittings.get(quote.fitting_id) ?? null : null;
  const refundUsedBefore = usedBefore(usage, quote.fitting_id, quote.id);

  let specs: WorkSpec[] = [];
  if (work) {
    const { data: s } = await db()
      .from("gw_work_order_specs")
      .select("*")
      .eq("work_order_id", (work as WorkOrder).id)
      .order("line_no");
    specs = (s ?? []) as WorkSpec[];
  }

  const list = (items ?? []) as QuoteItem[];
  const priced = priceQuote(
    list.map(toItemInput),
    toQuoteInput(quote, { fittingMinutes: fitting?.fitting_minutes, alreadyUsed: refundUsedBefore }),
    rules,
  );
  return { quote, fitting, refundUsedBefore, items: list, work: (work as WorkOrder | null) ?? null, specs, rules, priced };
}

/** 返金の内訳（画面と印刷の両方で同じ文言を出すため、ここから配る） */
export function refundBreakdown(full: Pick<FullQuote, "fitting" | "items" | "refundUsedBefore">) {
  const counts = countClubs(full.items.map(toItemInput));
  return {
    counts,
    ...computeFittingRefund(full.fitting?.fitting_minutes ?? null, counts, { alreadyRefunded: full.refundUsedBefore }),
  };
}

export { toItemInput, toQuoteInput, getRefundUsage, usedBefore, decorateTrials, getFittingsByIds };
