"use server";

import { revalidatePath } from "next/cache";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";
import { requireStoreAccess, FRANK_STORE_ID } from "@/lib/store-scope";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

const STATUSES = ["pending", "confirmed", "done", "canceled"];

/** 体験申込のステータス変更（未対応/日程確定/来店済/キャンセル） */
export async function setTrialStatus(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // FRANK姫路の体験申込（#134）
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const to = str(formData.get("to"));
  if (!id || !STATUSES.includes(to)) return;
  await admin
    .from("mbr_trial_requests")
    .update({ status: to, reviewed_by: actor.staffId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID);
  await logAudit(actor, "trial.status", "mbr_trial_requests", id, null, { status: to });
  revalidatePath("/trials");
}

/** スタッフメモの保存 */
export async function saveTrialNote(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // FRANK姫路の体験申込（#134）
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin
    .from("mbr_trial_requests")
    .update({ staff_note: str(formData.get("staff_note")) || null })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID);
  revalidatePath("/trials");
}
