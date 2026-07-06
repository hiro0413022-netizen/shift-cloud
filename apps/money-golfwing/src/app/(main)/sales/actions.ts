"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getActiveSegment, canWriteSegment, latestCashBalance, toNum } from "@/lib/money";

/** 売上明細を1件追加。支払方法=現金なら現金出納へ入金行を自動連携。 */
export async function addSale(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const seg = await getActiveSegment(actor.companyId);
  if (!seg || !canWriteSegment(actor, seg.id)) return;

  const soldOn = String(formData.get("sold_on") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const amount = toNum(formData.get("amount"));
  if (!soldOn || !category || amount === 0) return;

  const taxIncluded = toNum(formData.get("tax_included")) || null;
  const payMethod = String(formData.get("pay_method") ?? "").trim() || null;
  const customer = String(formData.get("customer_name") ?? "").trim() || null;
  const memberKind = String(formData.get("member_kind") ?? "").trim() || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const productName = String(formData.get("product_name") ?? "").trim();
  const qty = toNum(formData.get("qty"));
  const detail: Record<string, unknown> = {};
  if (productName) detail.product_name = productName;
  if (qty) detail.qty = qty;

  const { data: sale } = await admin
    .from("mon_sales")
    .insert({
      company_id: actor.companyId,
      segment_id: seg.id,
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

  // 現金売上 → 現金出納に入金として自動反映
  if (payMethod === "現金") {
    const inAmount = taxIncluded ?? amount;
    const prev = await latestCashBalance(actor.companyId, seg.id);
    await admin.from("mon_cash_ledger").insert({
      company_id: actor.companyId,
      segment_id: seg.id,
      entry_date: soldOn,
      summary: category,
      description: productName || customer || "現金売上",
      counterpart: customer,
      in_amount: inAmount,
      out_amount: 0,
      balance: prev + inAmount,
      memo: "売上入力から自動連携",
      entered_by: actor.name,
      source: "sales",
      source_ref: sale?.id ?? null,
    });
  }

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/sales");
  revalidatePath("/cash");
  revalidatePath("/");
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
