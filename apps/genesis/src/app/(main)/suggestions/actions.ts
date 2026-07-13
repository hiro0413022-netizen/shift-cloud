"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { generateSuggestions } from "@/lib/suggestions";
import { issueDirective, type DirectiveTarget } from "@/lib/directives";
import { logAudit } from "@/lib/kernel";

/** 改善提案を今すぐ作り直す（通常は日次レポート生成時に自動） */
export async function refreshSuggestions() {
  const actor = await requireGenesisActor();
  await generateSuggestions(actor.companyId);
  revalidatePath("/suggestions");
  revalidatePath("/");
}

/** 提案を却下（もう出さない） */
export async function dismissSuggestion(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdmin();
  await admin
    .from("ai_suggestions")
    .update({ dismissed_at: new Date().toISOString(), approval_status: "rejected", decided_by: actor.staffId, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  await logAudit(actor, "suggestion.dismiss", "ai_suggestions", id, null, null);
  revalidatePath("/suggestions");
  revalidatePath("/");
}

/** 提案を承認して、その場で実行指示にする（提案→指示が1クリックで繋がる） */
export async function approveSuggestionAndIssue(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const targetKind = String(formData.get("target_kind") ?? "ai_agent") as DirectiveTarget;
  const staffId = String(formData.get("staff_id") ?? "") || null;
  const agentId = String(formData.get("agent_id") ?? "") || null;
  const due = String(formData.get("due_date") ?? "") || null;
  if (!id) return;

  const admin = createAdmin();
  const { data: s } = await admin
    .from("ai_suggestions")
    .select("*")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!s) return;

  await issueDirective(actor, {
    target_kind: ["staff", "ai_agent", "external"].includes(targetKind) ? targetKind : "ai_agent",
    staff_id: staffId,
    agent_id: agentId,
    title: String(s.title),
    body: [s.body, s.suggested_action ? `\n【実行手順】\n${s.suggested_action}` : ""].filter(Boolean).join("\n"),
    due_date: due,
    priority: s.severity === "critical" ? "high" : "normal",
    origin_kind: "suggestion",
    origin_id: id,
  });

  await admin
    .from("ai_suggestions")
    .update({
      approval_status: "approved",
      execution_status: "executed", // 指示として発行済み（実行の完了は gn_directives 側で追う）
      decided_by: actor.staffId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, "suggestion.approve_issue", "ai_suggestions", id, null, { targetKind, staffId, agentId });
  revalidatePath("/suggestions");
  revalidatePath("/directives");
  revalidatePath("/");
}
