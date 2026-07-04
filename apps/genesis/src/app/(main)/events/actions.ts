"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { logAudit, logEvent } from "@/lib/kernel";

export async function createEvent(formData: FormData) {
  const actor = await requireGenesisActor();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const id = await logEvent(actor.companyId, {
    event_type: String(formData.get("event_type") ?? "note") || "note",
    title,
    description: String(formData.get("description") ?? "") || undefined,
    severity: (String(formData.get("severity") ?? "info") as "info" | "notice" | "warning" | "critical"),
    source: "manual",
    source_type: "human",
  });
  await logAudit(actor, "company_event.create", "company_events", id);
  revalidatePath("/events");
}
