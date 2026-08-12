"use server";

import { revalidatePath } from "next/cache";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { requireStoreAccess } from "@/lib/store-scope";

/** 対象の来店行が自分の店舗のものか確かめる（#134）。company_idだけでは他店舗の行を書き換えられる */
async function assertOwnVisit(
  admin: ReturnType<typeof createAdmin>,
  actor: { isOwner: boolean; storeIds: string[]; primaryStoreId: string | null; companyId: string },
  id: string,
): Promise<boolean> {
  const { data } = await admin
    .from("mbr_walkin_visits")
    .select("id, store_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return false;
  requireStoreAccess(actor, data.store_id as string | null);
  return true;
}

export async function markFollowUp(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  if (!(await assertOwnVisit(admin, actor, id))) return;
  const note = String(formData.get("note") ?? "").trim() || null;
  await admin
    .from("mbr_walkin_visits")
    .update({ follow_up_at: new Date().toISOString(), follow_up_note: note, follow_up_by: actor.staffId })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/follow");
}

export async function undoFollowUp(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  if (!(await assertOwnVisit(admin, actor, id))) return;
  await admin
    .from("mbr_walkin_visits")
    .update({ follow_up_at: null, follow_up_note: null, follow_up_by: null })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/follow");
}
