"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { enqueueAction, cancelAction, approveAction, rejectAction, runDueActions } from "@/lib/ai-execution";
import { recordFeedback, reviseWithAi } from "@/lib/feedback";
import { logAudit } from "@/lib/kernel";

/** 動作確認: 無害なテストアクションを取消枠つきで投入（company_eventsに残すだけ） */
export async function enqueueTestAction() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  await enqueueAction(admin, {
    companyId: actor.companyId,
    actionType: "test_notify",
    title: `テスト実行 ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
    payload: { by: actor.name },
    originKind: "test",
    createdBy: actor.staffId,
  });
  revalidatePath("/executions");
}

/** auto_undo の取消 */
export async function cancelActionForm(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (id) await cancelAction(actor, id);
  revalidatePath("/executions");
}

/** approval を承認 */
export async function approveActionForm(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (id) await approveAction(actor, id);
  revalidatePath("/executions");
}

/** approval を却下 */
export async function rejectActionForm(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (id) await rejectAction(actor, id);
  revalidatePath("/executions");
}

/* ---------- 修正指示（承認待ちの文面を直してから承認する） ---------- */

type ReviseResult = { ok: boolean; error?: string };

async function applyRevision(
  id: string,
  newBody: string,
  instruction: string,
  source: "revise" | "edit"
): Promise<ReviseResult> {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data: row } = await admin
    .from("ai_action_queue")
    .select("id, action_type, payload, status")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("status", "awaiting_approval")
    .maybeSingle();
  if (!row) return { ok: false, error: "承認待ちのアクションが見つかりません（既に承認/却下済みの可能性）" };

  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const before = String(payload.body ?? payload.message ?? "");
  const revisions = Array.isArray(payload.revisions) ? (payload.revisions as unknown[]) : [];
  const newPayload = {
    ...payload,
    body: newBody,
    revisions: [
      ...revisions,
      { at: new Date().toISOString(), by: actor.staffId, instruction, before: before.slice(0, 2000) },
    ],
  };
  await admin.from("ai_action_queue").update({ payload: newPayload }).eq("id", id);
  await logAudit(actor, "ai_action.revise", "ai_action_queue", id, { body: before }, { body: newBody, instruction });
  // 学習: 修正指示を蓄積 → 次回生成とAI修正のプロンプトに注入される（0090）
  await recordFeedback(admin, {
    companyId: actor.companyId,
    contextKind: String(row.action_type),
    actionQueueId: id,
    instruction,
    beforeText: before,
    afterText: newBody,
    source,
    createdBy: actor.staffId,
  });
  return { ok: true };
}

/** AI修正: 「もっと柔らかく」等の指示文でAIが文面を書き直す（承認待ちのまま） */
export async function reviseActionAiForm(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const instruction = String(formData.get("instruction") ?? "").trim();
  if (!id || !instruction) return;

  const admin = createAdmin();
  const { data: row } = await admin
    .from("ai_action_queue")
    .select("id, action_type, payload")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("status", "awaiting_approval")
    .maybeSingle();
  if (!row) return;
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const current = String(payload.body ?? payload.message ?? "");
  if (!current) return;

  const revised = await reviseWithAi(actor.companyId, String(row.action_type), current, instruction);
  if (revised.ok) await applyRevision(id, revised.body, instruction, "revise");
  revalidatePath("/");
  revalidatePath("/executions");
}

/** 直接編集: 文面をそのまま差し替える（メモ欄があれば学習にも使う） */
export async function reviseActionEditForm(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!id || !body) return;
  await applyRevision(id, body, note || "（直接編集）", "edit");
  revalidatePath("/");
  revalidatePath("/executions");
}

/** 今すぐ実行キューを回す（cronを待たずに確認したいとき） */
export async function runNow() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  await runDueActions(admin, actor.companyId);
  revalidatePath("/executions");
}
