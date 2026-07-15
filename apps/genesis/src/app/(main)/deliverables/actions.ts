"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

/** 成果物のレビュー結果を記録（承認 / 却下）。配信・課金は行わない（VISION §7） */
export async function reviewDeliverable(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // approved / rejected
  if (!id || !["approved", "rejected"].includes(decision)) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("ai_execution_logs")
    .select("id, review_status, task")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before || before.review_status !== "pending") return;

  await admin
    .from("ai_execution_logs")
    .update({ review_status: decision, reviewed_at: new Date().toISOString(), reviewed_by: actor.staffId })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, `deliverable.${decision}`, "ai_execution_logs", id, before, { review_status: decision });
  await logEvent(actor.companyId, {
    event_type: `deliverable.${decision}`,
    title: `成果物を${decision === "approved" ? "承認" : "却下"}: ${String(before.task).slice(0, 40)}`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/deliverables");
  revalidatePath("/");
}
