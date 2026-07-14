"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

export async function createDecision(formData: FormData) {
  const actor = await requireGenesisActor();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const admin = createAdmin();
  const { data } = await admin
    .from("decision_logs")
    .insert({
      company_id: actor.companyId,
      title,
      decision_type: String(formData.get("decision_type") ?? "business"),
      context: String(formData.get("context") ?? "") || null,
      options_considered: String(formData.get("options_considered") ?? "") || null,
      selected_option: String(formData.get("selected_option") ?? "") || null,
      reason: String(formData.get("reason") ?? "") || null,
      expected_result: String(formData.get("expected_result") ?? "") || null,
      decided_by: actor.staffId,
    })
    .select("id")
    .single();

  await logAudit(actor, "decision.create", "decision_logs", data?.id ?? null);
  await logEvent(actor.companyId, {
    event_type: "decision.made",
    title: `意思決定: ${title.slice(0, 60)}`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/decisions");
}

export async function updateOutcome(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const outcome = String(formData.get("outcome") ?? "pending");
  const actualResult = String(formData.get("actual_result") ?? "") || null;
  if (!id) return;

  const admin = createAdmin();
  await admin
    .from("decision_logs")
    .update({ outcome, actual_result: actualResult })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, "decision.update_outcome", "decision_logs", id, null, { outcome });
  revalidatePath("/decisions");
}
