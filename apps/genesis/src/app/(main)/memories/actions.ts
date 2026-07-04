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
