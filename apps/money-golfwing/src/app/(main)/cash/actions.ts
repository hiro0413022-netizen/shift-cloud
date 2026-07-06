"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, canWriteStore, latestCashBalance, toNum } from "@/lib/money";

/** 現金出納に1行追加。残高は直近残高＋入金−出金で自動計算（店舗別）。 */
export async function addCashEntry(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  if (!store || !store.segmentId || !canWriteStore(actor, store.id)) return;

  const entryDate = String(formData.get("entry_date") ?? "").trim();
  const inAmount = toNum(formData.get("in_amount"));
  const outAmount = toNum(formData.get("out_amount"));
  if (!entryDate || (inAmount === 0 && outAmount === 0)) return;

  const prev = await latestCashBalance(actor.companyId, store.id);
  await admin.from("mon_cash_ledger").insert({
    company_id: actor.companyId,
    store_id: store.id,
    segment_id: store.segmentId,
    entry_date: entryDate,
    summary: String(formData.get("summary") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    counterpart: String(formData.get("counterpart") ?? "").trim() || null,
    in_amount: inAmount,
    out_amount: outAmount,
    balance: prev + inAmount - outAmount,
    memo: String(formData.get("memo") ?? "").trim() || null,
    entered_by: actor.name,
    source: "app",
  });

  revalidatePath("/cash");
  revalidatePath("/count");
  revalidatePath("/");
}

export async function deleteCashEntry(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await admin.from("mon_cash_ledger").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
  revalidatePath("/cash");
}
