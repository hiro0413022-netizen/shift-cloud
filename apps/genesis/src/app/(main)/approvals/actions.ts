"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

export async function decideApproval(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // approved / rejected
  if (!id || !["approved", "rejected"].includes(decision)) return;

  const admin = createAdmin();
  const { data: before } = await admin.from("approval_requests").select("*").eq("id", id).eq("company_id", actor.companyId).single();
  if (!before || before.status !== "pending") return;

  await admin
    .from("approval_requests")
    .update({ status: decision, decided_by: actor.staffId, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, `approval.${decision}`, "approval_requests", id, before, { status: decision });
  await logEvent(actor.companyId, {
    event_type: `approval.${decision}`,
    title: `承認リクエスト${decision === "approved" ? "承認" : "却下"}: ${String(before.kind)}`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/approvals");
  revalidatePath("/command");
}
