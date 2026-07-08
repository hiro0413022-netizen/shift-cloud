"use server";

import { revalidatePath } from "next/cache";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

export async function markFollowUp(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
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
  await admin
    .from("mbr_walkin_visits")
    .update({ follow_up_at: null, follow_up_note: null, follow_up_by: null })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/follow");
}
