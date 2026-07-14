"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, canWriteStore, latestCashBalance, toNum, DENOMS } from "@/lib/money";

/** 金種棚卸を1件保存。合計を自動計算し、その店舗の理論残高との差異を算出。 */
export async function addCount(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  if (!store || !store.segmentId || !canWriteStore(actor, store.id)) return;

  const countedAt = String(formData.get("counted_at") ?? "").trim() || new Date().toISOString();
  const location = String(formData.get("location") ?? "register").trim();

  const denominations: Record<string, number> = {};
  let total = 0;
  for (const d of DENOMS) {
    const n = Math.trunc(toNum(formData.get(`d${d}`)));
    if (n) {
      denominations[String(d)] = n;
      total += d * n;
    }
  }
  if (total === 0) return;

  const theoretical = await latestCashBalance(actor.companyId, store.id);
  await admin.from("mon_cash_count").insert({
    company_id: actor.companyId,
    store_id: store.id,
    segment_id: store.segmentId,
    counted_at: countedAt,
    location,
    denominations,
    total,
    theoretical,
    diff: total - theoretical,
    counted_by: actor.name,
    memo: String(formData.get("memo") ?? "").trim() || null,
  });

  revalidatePath("/count");
  revalidatePath("/");
}

export async function deleteCount(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await admin.from("mon_cash_count").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
  revalidatePath("/count");
}
