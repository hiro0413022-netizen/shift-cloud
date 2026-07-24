"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyActor, type MoneyActor, type AccessibleStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, canWriteStore, latestCashBalance, toNum } from "@/lib/money";

type Admin = ReturnType<typeof createAdmin>;

/** クライアントから渡す売上明細（1件） */
export type SaleInput = {
  soldOn: string;
  category: string;
  customerName?: string;
  memberKind?: string;
  amount: number;
  taxIncluded?: number | null;
  payMethod?: string;
  productName?: string;
  qty?: number;
  memo?: string;
};

/**
 * 売上を1件挿入。支払方法=現金なら現金出納へ入金行を連携。
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
  const soldOn = String(input.soldOn ?? "").trim();
  const category = String(input.category ?? "").trim();
  const amount = Number(input.amount) || 0;
  if (!soldOn || !category || amount === 0) return cashBalance;

  const taxIncluded = input.taxIncluded != null && input.taxIncluded !== 0 ? Number(input.taxIncluded) : null;
  const payMethod = (input.payMethod ?? "").trim() || null;
  const customer = (input.customerName ?? "").trim() || null;
  const memberKind = (input.memberKind ?? "").trim() || null;
  const memo = (input.memo ?? "").trim() || null;
  const productName = (input.productName ?? "").trim();
  const qty = Number(input.qty) || 0;

  const detail: Record<string, unknown> = {};
  if (productName) detail.product_name = productName;
  if (qty) detail.qty = qty;

  const { data: sale } = await admin
    .from("mon_sales")
    .insert({
      company_id: actor.companyId,
      store_id: store.id,
      segment_id: store.segmentId,
      sold_on: soldOn,
      category,
      customer_name: customer,
      member_kind: memberKind,
      amount,
      tax_included: taxIncluded,
      pay_method: payMethod,
      memo,
      detail,
      entered_by: actor.name,
      source: "app",
    })
    .select("id")
    .single();

  // 現金売上 → 店舗の現金出納に入金として自動反映
  if (payMethod === "現金") {
    const inAmount = taxIncluded ?? amount;
    const newBalance = cashBalance + inAmount;
    await admin.from("mon_cash_ledger").insert({
      company_id: actor.companyId,
      store_id: store.id,
      segment_id: store.segmentId,
      entry_date: soldOn,
      summary: category,
      description: productName || customer || "現金売上",
      counterpart: customer,
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

export async function deleteSale(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await admin.from("mon_sales").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/sales");
  revalidatePath("/");
}
