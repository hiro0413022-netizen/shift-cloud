"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { generateSuggestions } from "@/lib/suggestions";
import { issueDirective, issueCampaign, type DirectiveTarget, type DirectiveStepInput } from "@/lib/directives";
import { draftCampaignSteps, type DraftStep } from "@/lib/step-planner";
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

/** 提案を承認して、その場で単一の実行指示にする（旧・1クリック導線。工程が不要な軽い提案向け） */
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

/** AIに「実行手順→工程リスト（担当割り当て込み）」を下書きさせる（保存はしない・画面で編集する） */
export async function draftStepsForSuggestion(id: string): Promise<{ steps: DraftStep[]; engine: "claude" | "rules" }> {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data: s } = await admin
    .from("ai_suggestions")
    .select("title, body, suggested_action")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!s) return { steps: [], engine: "rules" };
  return draftCampaignSteps(actor.companyId, {
    title: String(s.title),
    body: s.body ? String(s.body) : null,
    suggested_action: s.suggested_action ? String(s.suggested_action) : null,
  });
}

/** 提案を（編集後の文面＋工程で）キャンペーンとして発行 = 現場が回る指示にする */
export async function approveSuggestionAndIssueCampaign(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const due = String(formData.get("due_date") ?? "") || null;
  const stepsRaw = String(formData.get("steps") ?? "[]");
  if (!id || !title) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stepsRaw);
  } catch {
    parsed = [];
  }
  const steps: DirectiveStepInput[] = (Array.isArray(parsed) ? parsed : [])
    .map((s) => s as Record<string, unknown>)
    .filter((s) => s && String(s.title ?? "").trim())
    .map((s) => {
      const target: "staff" | "ai_agent" = s.target_kind === "ai_agent" ? "ai_agent" : "staff";
      return {
        title: String(s.title).trim(),
        detail: s.detail ? String(s.detail) : null,
        target_kind: target,
        staff_id: target === "staff" ? (String(s.staff_id ?? "") || null) : null,
        agent_id: target === "ai_agent" ? (String(s.agent_id ?? "") || null) : null,
        due_date: String(s.due_date ?? "") || null,
      };
    });
  if (steps.length === 0) return;

  const admin = createAdmin();
  const { data: s } = await admin
    .from("ai_suggestions")
    .select("severity")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();

  const directiveId = await issueCampaign(actor, {
    title,
    body: body || null,
    due_date: due,
    priority: s?.severity === "critical" ? "high" : "normal",
    origin_kind: "suggestion",
    origin_id: id,
    steps,
  });

  await admin
    .from("ai_suggestions")
    .update({
      approval_status: "approved",
      execution_status: "executed",
      decided_by: actor.staffId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, "suggestion.issue_campaign", "ai_suggestions", id, null, { directiveId, steps: steps.length });
  revalidatePath("/suggestions");
  revalidatePath("/directives");
  revalidatePath("/");
}
