"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyActor, type MoneyActor, type AccessibleStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, canWriteStore, latestCashBalance, rebalanceCashLedger, toNum } from "@/lib/money";

type Admin = ReturnType<typeof createAdmin>;

/** クライアントから渡す売上明細（1件） */
export type SaleInput = {
  soldOn: string;
  category: string;
  customerName?: string;
  memberKind?: string;
  /** 定価（税抜・1個あたり）。売上台帳Excelの H列 */
  listPrice?: number | null;
  /** 割引額（値引きはマイナス）。売上台帳Excelの I列。売価 = 定価 + 割引額 */
  discount?: number | null;
  /** 金額（税抜合計＝売価×個数）。集計の正はここ */
  amount: number;
  /** 決済金額（税込。実際に頂いた額） */
  taxIncluded?: number | null;
  payMethod?: string;
  productName?: string;
  /** Inventory OS の品番ID。付いていると保存時に在庫が減る（inv_movements kind='sale'） */
  invItemId?: string;
  qty?: number;
  /** 担当プロ（mon_pros の名前スナップショット） */
  pro?: string;
  memo?: string;
};

/** 明細編集（updateSale）用: id 付き */
export type SaleUpdate = SaleInput & { id: string };

/** 0や空を「未入力(null)」として扱う。0円の定価・0円の割引は書いても意味がないため */
function optNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function normalizeInput(input: SaleInput) {
  return {
    soldOn: String(input.soldOn ?? "").trim(),
    category: String(input.category ?? "").trim(),
    listPrice: optNum(input.listPrice),
    discount: optNum(input.discount),
    amount: Number(input.amount) || 0,
    taxIncluded: input.taxIncluded != null && input.taxIncluded !== 0 ? Number(input.taxIncluded) : null,
    payMethod: (input.payMethod ?? "").trim() || null,
    customer: (input.customerName ?? "").trim() || null,
    memberKind: (input.memberKind ?? "").trim() || null,
    memo: (input.memo ?? "").trim() || null,
    productName: (input.productName ?? "").trim(),
    invItemId: (input.invItemId ?? "").trim() || null,
    // 個数は必須（1以上）。未指定・不正値は1個扱いで保存する
    qty: Math.max(1, Number(input.qty) || 1),
    pro: (input.pro ?? "").trim() || null,
  };
}

function buildDetail(base: Record<string, unknown>, n: ReturnType<typeof normalizeInput>): Record<string, unknown> {
  const detail: Record<string, unknown> = { ...base };
  delete detail.product_name; delete detail.qty; delete detail.pro; delete detail.inv_item_id;
  // 未入力なら消す（編集で定価を空にしたのに古い値が残る、を防ぐ）
  delete detail.list_price; delete detail.discount;
  if (n.productName) detail.product_name = n.productName;
  if (n.qty) detail.qty = n.qty;
  if (n.pro) detail.pro = n.pro;
  if (n.invItemId) detail.inv_item_id = n.invItemId;
  if (n.listPrice != null) detail.list_price = n.listPrice;
  if (n.discount != null) detail.discount = n.discount;
  return detail;
}

/**
 * 在庫連動: mon_sales 1件 ↔ inv_movements(kind='sale') 1行 を同期する。
 * source_app='money-os' / source_id=saleId で紐付け（uq_inv_mov_source が二重起票を防ぐ）。
 * 販売＝qtyは負。個数未入力は1個扱い。
 */
async function syncInvMovement(
  admin: Admin,
  actor: MoneyActor,
  saleId: string,
  storeId: string,
  soldOn: string,
  invItemId: string | null,
  qty: number,
  productName: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("inv_movements")
    .select("id, item_id")
    .eq("source_app", "money-os").eq("source_id", saleId)
    .is("deleted_at", null)
    .limit(1);
  const cur = existing?.[0] ?? null;
  const moveQty = -(qty || 1);

  if (!invItemId) {
    if (cur) await admin.from("inv_movements").update({ deleted_at: new Date().toISOString() }).eq("id", cur.id);
    return;
  }

  if (cur && cur.item_id === invItemId) {
    await admin.from("inv_movements")
      .update({ occurred_on: soldOn, qty: moveQty, memo: productName || null })
      .eq("id", cur.id);
    return;
  }
  // 品番が変わった/新規: 旧を消してから起票（partial unique index が空くのでINSERTできる）
  if (cur) await admin.from("inv_movements").update({ deleted_at: new Date().toISOString() }).eq("id", cur.id);

  const { data: item } = await admin
    .from("inv_items").select("id, cost_price")
    .eq("id", invItemId).eq("company_id", actor.companyId)
    .is("deleted_at", null).single();
  if (!item) return; // 存在しない品番は在庫連動だけ諦める（売上自体は通す）

  await admin.from("inv_movements").insert({
    company_id: actor.companyId,
    item_id: invItemId,
    store_id: storeId,
    occurred_on: soldOn,
    kind: "sale",
    qty: moveQty,
    unit_cost: item.cost_price,
    source_app: "money-os",
    source_id: saleId,
    memo: productName || null,
    created_by: actor.staffId,
  });
}

/**
 * 売上を1件挿入。支払方法=現金なら現金出納へ入金行を連携。在庫品番付きなら在庫を減らす。
 * 現金残高はbalanceを受け取り累積させる（複数件を1バッチで入れるため）。
 * @returns 更新後の現金残高
 */
async function insertOneSale(
  admin: Admin,
  actor: MoneyActor,
  store: AccessibleStore,
  input: SaleInput,
  cashBalance: number,
): Promise<number> {
  const n = normalizeInput(input);
  if (!n.soldOn || !n.category || n.amount === 0) return cashBalance;

  const { data: sale } = await admin
    .from("mon_sales")
    .insert({
      company_id: actor.companyId,
      store_id: store.id,
      segment_id: store.segmentId,
      sold_on: n.soldOn,
      category: n.category,
      customer_name: n.customer,
      member_kind: n.memberKind,
      amount: n.amount,
      tax_included: n.taxIncluded,
      pay_method: n.payMethod,
      memo: n.memo,
      detail: buildDetail({}, n),
      entered_by: actor.name,
      source: "app",
    })
    .select("id")
    .single();

  // 在庫リストの品番を選んで売った → 在庫を減らす（Inventory OS 連携。DECISIONS #96(e)）
  if (sale && n.invItemId) {
    await syncInvMovement(admin, actor, sale.id, store.id, n.soldOn, n.invItemId, n.qty, n.productName);
  }

  // 現金売上 → 店舗の現金出納に入金として自動反映
  if (n.payMethod === "現金") {
    const inAmount = n.taxIncluded ?? n.amount;
    const newBalance = cashBalance + inAmount;
    await admin.from("mon_cash_ledger").insert({
      company_id: actor.companyId,
      store_id: store.id,
      segment_id: store.segmentId,
      entry_date: n.soldOn,
      summary: n.category,
      description: n.productName || n.customer || "現金売上",
      counterpart: n.customer,
      in_amount: inAmount,
      out_amount: 0,
      balance: newBalance,
      memo: "売上入力から自動連携",
      entered_by: actor.name,
      source: "sales",
      source_ref: sale?.id ?? null,
    });
    return newBalance;
  }
  return cashBalance;
}

/** 売上1件を追加（連続入力モード）。 */
export async function createSale(input: SaleInput): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  if (!store || !store.segmentId || !canWriteStore(actor, store.id)) return;

  const prev = await latestCashBalance(actor.companyId, store.id);
  await insertOneSale(admin, actor, store, input, prev);

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/sales");
  revalidatePath("/cash");
  revalidatePath("/");
}

/** 複数の売上をまとめて追加（まとめ入力モード）。現金残高は行をまたいで累積。 */
export async function createSales(inputs: SaleInput[]): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  if (!store || !store.segmentId || !canWriteStore(actor, store.id)) return;
  if (!Array.isArray(inputs) || inputs.length === 0) return;

  let balance = await latestCashBalance(actor.companyId, store.id);
  for (const input of inputs) {
    balance = await insertOneSale(admin, actor, store, input, balance);
  }

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/sales");
  revalidatePath("/cash");
  revalidatePath("/");
}

/**
 * 売上明細を編集。連携先も同期する:
 *  - 現金出納: 現金→現金は行を更新 / 現金→他は行を削除 / 他→現金は行を新規 / 最後に残高を積み直し
 *  - 在庫: inv_movements(sale) の数量・日付を更新（品番が外れたら取り消し＝在庫が戻る）
 */
export async function updateSale(input: SaleUpdate): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(input.id ?? "").trim();
  if (!id) return;

  const { data: sale } = await admin
    .from("mon_sales")
    .select("id, store_id, segment_id, detail, pay_method")
    .eq("id", id).eq("company_id", actor.companyId)
    .is("deleted_at", null).single();
  if (!sale || !canWriteStore(actor, String(sale.store_id))) return;

  const n = normalizeInput(input);
  if (!n.soldOn || !n.category || n.amount === 0) return;
  const storeId = String(sale.store_id);

  await admin.from("mon_sales").update({
    sold_on: n.soldOn,
    category: n.category,
    customer_name: n.customer,
    member_kind: n.memberKind,
    amount: n.amount,
    tax_included: n.taxIncluded,
    pay_method: n.payMethod,
    memo: n.memo,
    detail: buildDetail((sale.detail as Record<string, unknown>) ?? {}, n),
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  // --- 在庫連動の同期 ---
  await syncInvMovement(admin, actor, id, storeId, n.soldOn, n.invItemId, n.qty, n.productName);

  // --- 現金出納の同期 ---
  const { data: ledgerRows } = await admin
    .from("mon_cash_ledger")
    .select("id")
    .eq("company_id", actor.companyId).eq("source", "sales").eq("source_ref", id)
    .is("deleted_at", null).limit(1);
  const ledger = ledgerRows?.[0] ?? null;
  const isCash = n.payMethod === "現金";
  const inAmount = n.taxIncluded ?? n.amount;

  if (isCash && ledger) {
    await admin.from("mon_cash_ledger").update({
      entry_date: n.soldOn,
      summary: n.category,
      description: n.productName || n.customer || "現金売上",
      counterpart: n.customer,
      in_amount: inAmount,
      updated_at: new Date().toISOString(),
    }).eq("id", ledger.id);
  } else if (isCash && !ledger) {
    await admin.from("mon_cash_ledger").insert({
      company_id: actor.companyId,
      store_id: storeId,
      segment_id: sale.segment_id,
      entry_date: n.soldOn,
      summary: n.category,
      description: n.productName || n.customer || "現金売上",
      counterpart: n.customer,
      in_amount: inAmount,
      out_amount: 0,
      balance: 0, // 直後の積み直しで確定
      memo: "売上入力から自動連携",
      entered_by: actor.name,
      source: "sales",
      source_ref: id,
    });
  } else if (!isCash && ledger) {
    await admin.from("mon_cash_ledger").update({ deleted_at: new Date().toISOString() }).eq("id", ledger.id);
  }
  await rebalanceCashLedger(actor.companyId, storeId);

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/sales");
  revalidatePath("/cash");
  revalidatePath("/");
}

/** 売上明細を1件追加（旧・FormData版。互換のため残置）。 */
export async function addSale(formData: FormData): Promise<void> {
  await createSale({
    soldOn: String(formData.get("sold_on") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    customerName: String(formData.get("customer_name") ?? "").trim() || undefined,
    memberKind: String(formData.get("member_kind") ?? "").trim() || undefined,
    amount: toNum(formData.get("amount")),
    taxIncluded: toNum(formData.get("tax_included")) || null,
    payMethod: String(formData.get("pay_method") ?? "").trim() || undefined,
    productName: String(formData.get("product_name") ?? "").trim() || undefined,
    qty: toNum(formData.get("qty")) || undefined,
    memo: String(formData.get("memo") ?? "").trim() || undefined,
  });
}

/**
 * 売上を削除（論理削除）。連携先も戻す:
 *  - 現金出納の自動連携行を削除して残高を積み直し（従来は残ったままだった）
 *  - 在庫連動の inv_movements を取り消し（在庫が戻る）
 */
export async function deleteSaleById(id: string): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  if (!id) return;

  const { data: sale } = await admin
    .from("mon_sales")
    .select("id, store_id")
    .eq("id", id).eq("company_id", actor.companyId)
    .is("deleted_at", null).single();
  if (!sale || !canWriteStore(actor, String(sale.store_id))) return;

  const now = new Date().toISOString();
  await admin.from("mon_sales").update({ deleted_at: now }).eq("id", id);

  // 在庫連動を取り消し
  await admin.from("inv_movements").update({ deleted_at: now })
    .eq("source_app", "money-os").eq("source_id", id).is("deleted_at", null);

  // 現金出納の自動連携行を削除→残高積み直し
  const { data: ledgerRows } = await admin
    .from("mon_cash_ledger").select("id")
    .eq("company_id", actor.companyId).eq("source", "sales").eq("source_ref", id)
    .is("deleted_at", null);
  if ((ledgerRows ?? []).length > 0) {
    await admin.from("mon_cash_ledger").update({ deleted_at: now })
      .in("id", (ledgerRows ?? []).map((r) => r.id));
  }
  await rebalanceCashLedger(actor.companyId, String(sale.store_id));

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/sales");
  revalidatePath("/cash");
  revalidatePath("/");
}

/** 旧・FormData版（互換のため残置）。 */
export async function deleteSale(formData: FormData): Promise<void> {
  await deleteSaleById(String(formData.get("id") ?? ""));
}

// ============================================================
// お客様の購入履歴（明細のお客様名クリックで開く）
// ============================================================

export type CustomerPurchase = {
  soldOn: string;
  category: string;
  productName: string;
  qty: number;
  amount: number;
  payMethod: string;
  pro: string;
  memo: string;
  /** 台帳(Excel取込) 由来か、アプリ入力か */
  source: "ledger" | "app";
};

export type CustomerHistory = {
  name: string;
  memberKind: string;
  /** 税抜の累計 */
  total: number;
  count: number;
  /** 来店日数（同じ日の複数明細は1回と数える） */
  visitDays: number;
  firstOn: string | null;
  lastOn: string | null;
  rows: CustomerPurchase[];
  /** 上限に達して打ち切られたか */
  truncated: boolean;
};

const HISTORY_LIMIT = 300;

/**
 * お客様1人の購入履歴。
 * アプリ入力(mon_sales)と売上台帳の取込明細(mon_sales_lines)の両方を混ぜて返す。
 * 台帳側にしか無い過去の履歴が落ちると「このお客様は初めて」と誤読するため。
 */
export async function getCustomerHistory(name: string): Promise<CustomerHistory | null> {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  const customer = String(name ?? "").trim();
  if (!store || !customer) return null;

  const admin = createAdmin();
  const [{ data: sales }, { data: lines }] = await Promise.all([
    admin.from("mon_sales")
      .select("sold_on, category, customer_name, member_kind, amount, pay_method, memo, detail")
      .eq("company_id", actor.companyId).eq("store_id", store.id)
      .eq("customer_name", customer).eq("source", "app")
      .is("deleted_at", null)
      .order("sold_on", { ascending: false }).limit(HISTORY_LIMIT),
    admin.from("mon_sales_lines")
      .select("sold_on, customer_name, member_kind, item_category, product_name, qty, amount, pay_method, pro, memo")
      .eq("company_id", actor.companyId).eq("store_id", store.id)
      .eq("customer_name", customer)
      .is("deleted_at", null)
      .order("sold_on", { ascending: false }).limit(HISTORY_LIMIT),
  ]);

  const appRows = (sales ?? []) as Array<{
    sold_on: string; category: string; member_kind: string | null; amount: number | string;
    pay_method: string | null; memo: string | null; detail: Record<string, unknown> | null;
  }>;
  const ledgerRows = (lines ?? []) as Array<{
    sold_on: string; member_kind: string | null; item_category: string | null; product_name: string | null;
    qty: number | string | null; amount: number | string; pay_method: string | null; pro: string | null; memo: string | null;
  }>;

  const rows: CustomerPurchase[] = [
    ...appRows.map((r) => ({
      soldOn: String(r.sold_on),
      category: r.category ?? "",
      productName: String(r.detail?.product_name ?? ""),
      qty: Math.max(1, Number(r.detail?.qty) || 1),
      amount: Number(r.amount) || 0,
      payMethod: r.pay_method ?? "",
      pro: String(r.detail?.pro ?? ""),
      memo: r.memo ?? "",
      source: "app" as const,
    })),
    ...ledgerRows.map((r) => ({
      soldOn: String(r.sold_on),
      category: r.item_category ?? "",
      productName: r.product_name ?? "",
      qty: Math.max(1, Number(r.qty) || 1),
      amount: Number(r.amount) || 0,
      payMethod: r.pay_method ?? "",
      pro: r.pro ?? "",
      memo: r.memo ?? "",
      source: "ledger" as const,
    })),
  ].sort((a, b) => b.soldOn.localeCompare(a.soldOn));

  const memberKind =
    appRows.find((r) => r.member_kind)?.member_kind ??
    ledgerRows.find((r) => r.member_kind)?.member_kind ??
    "";
  const days = new Set(rows.map((r) => r.soldOn));

  return {
    name: customer,
    memberKind: memberKind ?? "",
    total: rows.reduce((a, r) => a + r.amount, 0),
    count: rows.length,
    visitDays: days.size,
    firstOn: rows.length > 0 ? rows[rows.length - 1].soldOn : null,
    lastOn: rows.length > 0 ? rows[0].soldOn : null,
    rows,
    truncated: appRows.length >= HISTORY_LIMIT || ledgerRows.length >= HISTORY_LIMIT,
  };
}
