"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

/**
 * 判断フィード用アクション（REDESIGN_2026-07 §3-1）
 * 体験申込の日程確定/キャンセルを member-os と同じ status 遷移でホームから実行する（§5a/§5d）。
 * 確定後のお客様への折り返し連絡はスタッフ運用（#72: 申込型・人が対応）。
 */
export async function decideTrialRequest(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // confirmed / canceled
  if (!id || !["confirmed", "canceled"].includes(decision)) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("mbr_trial_requests")
    .select("id, name, status")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before || before.status !== "pending") return;

  await admin
    .from("mbr_trial_requests")
    .update({ status: decision, reviewed_by: actor.staffId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, `trial.${decision}`, "mbr_trial_requests", id, before, { status: decision });
  await logEvent(actor.companyId, {
    event_type: `trial.${decision}`,
    title: `体験申込を${decision === "confirmed" ? "日程確定" : "キャンセル"}: ${String(before.name)}`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/");
}
