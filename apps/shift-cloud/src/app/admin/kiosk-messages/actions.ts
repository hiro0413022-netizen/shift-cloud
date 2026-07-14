"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

/** 打刻端末メッセージを対応済みにする（取り消しも可） */
export async function resolveMessage(formData: FormData) {
  const actor = await requireActor("edit_attendance");
  const admin = createAdmin();
  const id = String(formData.get("id"));
  const resolved = String(formData.get("resolved")) === "true";
  await admin.from("kiosk_messages")
    .update({ resolved, resolved_by: resolved ? actor.staffId : null, resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "kiosk_message.resolve", "kiosk_messages", id, null, { resolved });
  revalidatePath("/admin/kiosk-messages");
}
