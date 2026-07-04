"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

export async function updateDevStatus(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdmin();
  const patch = {
    phase: String(formData.get("phase") ?? "build"),
    status: String(formData.get("status") ?? "active"),
    progress: Math.min(100, Math.max(0, Number(formData.get("progress") ?? 0))),
    current_task: String(formData.get("current_task") ?? "") || null,
    next_action: String(formData.get("next_action") ?? "") || null,
  };
  await admin.from("development_statuses").update(patch).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "dev_status.update", "development_statuses", id, null, patch);
  revalidatePath("/dev");
  revalidatePath("/");
}

export async function createRisk(formData: FormData) {
  const actor = await requireGenesisActor();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const admin = createAdmin();
  const { data } = await admin
    .from("risks")
    .insert({
      company_id: actor.companyId,
      title,
      severity: String(formData.get("severity") ?? "medium"),
      area: String(formData.get("area") ?? "") || null,
      mitigation: String(formData.get("mitigation") ?? "") || null,
    })
    .select("id")
    .single();
  await logAudit(actor, "risk.create", "risks", data?.id ?? null);
  await logEvent(actor.companyId, {
    event_type: "risk.raised",
    title: `リスク登録: ${title.slice(0, 60)}`,
    severity: "warning",
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/dev");
  revalidatePath("/");
}

export async function closeRisk(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdmin();
  await admin.from("risks").update({ status: "mitigated" }).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "risk.mitigate", "risks", id);
  revalidatePath("/dev");
  revalidatePath("/");
}

export async function createBlocker(formData: FormData) {
  const actor = await requireGenesisActor();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const admin = createAdmin();
  const { data } = await admin
    .from("blockers")
    .insert({
      company_id: actor.companyId,
      title,
      blocking_what: String(formData.get("blocking_what") ?? "") || null,
      needs: String(formData.get("needs") ?? "") || null,
    })
    .select("id")
    .single();
  await logAudit(actor, "blocker.create", "blockers", data?.id ?? null);
  await logEvent(actor.companyId, {
    event_type: "blocker.raised",
    title: `ブロッカー登録: ${title.slice(0, 60)}`,
    severity: "warning",
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/dev");
  revalidatePath("/");
}

export async function resolveBlocker(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdmin();
  await admin.from("blockers").update({ status: "resolved" }).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "blocker.resolve", "blockers", id);
  await logEvent(actor.companyId, {
    event_type: "blocker.resolved",
    title: "ブロッカー解消",
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/dev");
  revalidatePath("/");
}
