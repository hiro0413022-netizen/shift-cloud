"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

export async function createMemory(formData: FormData) {
  const actor = await requireGenesisActor();
  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  if (!title || !summary) return;

  const admin = createAdmin();
  const { data } = await admin
    .from("business_memories")
    .insert({
      company_id: actor.companyId,
      title,
      summary,
      category: String(formData.get("category") ?? "general"),
      context: String(formData.get("context") ?? "") || null,
      learnings: String(formData.get("learnings") ?? "") || null,
      future_recommendation: String(formData.get("future_recommendation") ?? "") || null,
      importance: Number(formData.get("importance") ?? 3),
      human_verified: true,
      created_by: actor.staffId,
    })
    .select("id")
    .single();

  await logAudit(actor, "business_memory.create", "business_memories", data?.id ?? null);
  await logEvent(actor.companyId, {
    event_type: "memory.created",
    title: `記憶を追加: ${title.slice(0, 60)}`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/memories");
}

/* ---------- Genesis Memory（5スコープ・#299）: 書く・確定・忘れる。すべて Core の Tool を通す（記録・Policy・取消） ---------- */
export async function rememberMemory(formData: FormData) {
  const actor = await requireGenesisActor();
  const value = String(formData.get("value") ?? "").trim();
  if (!value) return;
  const scope = String(formData.get("scope") ?? "company");
  const scope_id = String(formData.get("scope_id") ?? "").trim() || undefined;
  const { runTool } = await import("@/core/run");
  await runTool({ actor, ref: "memory.remember", input: { value, scope, ...(scope_id ? { scope_id } : {}) }, origin: "memories" });
  revalidatePath("/memories");
}

export async function confirmMemory(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { runTool } = await import("@/core/run");
  await runTool({ actor, ref: "memory.confirm", input: { memory_id: id }, origin: "memories" });
  revalidatePath("/memories");
}

export async function forgetMemory(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { runTool } = await import("@/core/run");
  // soft delete（risk 1・即時）。戻すときは同じ内容をもう一度「覚える」
  await runTool({ actor, ref: "memory.forget", input: { memory_id: id }, origin: "memories", title: "記憶を忘れる" });
  revalidatePath("/memories");
}
