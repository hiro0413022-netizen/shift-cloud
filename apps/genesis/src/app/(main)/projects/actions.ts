"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";

/* Projects（#303）: 作る・紐づける・記憶する。すべて Core の Tool を通す（記録・Policy） */
export async function createProject(formData: FormData) {
  const actor = await requireGenesisActor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const goal = String(formData.get("goal") ?? "").trim();
  const due_on = String(formData.get("due_on") ?? "").trim();
  const { runTool } = await import("@/core/run");
  const r = await runTool({ actor, ref: "project.create", input: { name, ...(goal ? { goal } : {}), ...(due_on ? { due_on } : {}) }, origin: "projects" });
  revalidatePath("/projects");
  if (r.status === "ok" && r.output?.slug) {
    const { redirect } = await import("next/navigation");
    redirect(`/projects/${String(r.output.slug)}`);
  }
}

export async function linkProjectItem(formData: FormData) {
  const actor = await requireGenesisActor();
  const project = String(formData.get("project") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!project || !label) return;
  const kind = String(formData.get("kind") ?? "note");
  const url = String(formData.get("url") ?? "").trim();
  const { runTool } = await import("@/core/run");
  await runTool({ actor, ref: "project.link", input: { project, kind, label, ...(url ? { url } : {}) }, origin: "projects" });
  revalidatePath(`/projects/${String(formData.get("slug") ?? "")}`);
}

export async function rememberForProject(formData: FormData) {
  const actor = await requireGenesisActor();
  const projectId = String(formData.get("project_id") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!projectId || !value) return;
  const { runTool } = await import("@/core/run");
  await runTool({ actor, ref: "memory.remember", input: { value, scope: "project", scope_id: projectId }, origin: "projects" });
  revalidatePath(`/projects/${String(formData.get("slug") ?? "")}`);
}

export async function setProjectStatus(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["active", "paused", "done", "cancelled"].includes(status)) return;
  const { createAdmin } = await import("@/lib/supabase/admin");
  const admin = createAdmin();
  await admin.from("gn_projects").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
  revalidatePath("/projects");
  revalidatePath(`/projects/${String(formData.get("slug") ?? "")}`);
}
