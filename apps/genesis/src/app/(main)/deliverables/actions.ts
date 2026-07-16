"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";
import { enqueueAction } from "@/lib/ai-execution";

const CHANNEL_LABEL: Record<string, string> = {
  sns_ai: "SNS投稿",
  sales_ai: "営業アプローチ",
  cs_ai: "顧客対応",
  docs_ai: "資料",
};

/** 成果物のレビュー結果を記録（承認 / 却下）。承認時はexecutorに送信アクションを配線（#63） */
export async function reviewDeliverable(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // approved / rejected
  if (!id || !["approved", "rejected"].includes(decision)) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("ai_execution_logs")
    .select("id, review_status, task, agent_id, output")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before || before.review_status !== "pending") return;

  await admin
    .from("ai_execution_logs")
    .update({ review_status: decision, reviewed_at: new Date().toISOString(), reviewed_by: actor.staffId })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, `deliverable.${decision}`, "ai_execution_logs", id, before, { review_status: decision });
  await logEvent(actor.companyId, {
    event_type: `deliverable.${decision}`,
    title: `成果物を${decision === "approved" ? "承認" : "却下"}: ${String(before.task).slice(0, 40)}`,
    source: "manual",
    source_type: "human",
  });

  // #63: 承認した成果物を executor に配線。現状は外部送信チャネル（SNS/顧客）が未接続のため
  //      internal_notify（auto・無害）で「承認済み・手動送信待ち」を記録・可視化する。
  //      チャネル接続後はここの action_type を sns_post 等の実送信に差し替える。
  if (decision === "approved") {
    let label = "成果物";
    if (before.agent_id) {
      const { data: ag } = await admin.from("ai_agents").select("code").eq("id", before.agent_id).maybeSingle();
      label = CHANNEL_LABEL[String(ag?.code ?? "")] ?? label;
    }
    await enqueueAction(admin, {
      companyId: actor.companyId,
      actionType: "internal_notify",
      title: `承認済み成果物（${label}）: ${String(before.task).slice(0, 40)}`,
      payload: {
        title: `承認済み: ${label}`,
        body: `承認された成果物です。送信チャネル未接続のため手動で対応してください。\n\n${String(before.output ?? "").slice(0, 1500)}`,
      },
      originKind: "deliverable",
      originId: id,
      dedupeKey: `deliverable-${id}`,
      createdBy: actor.staffId,
    }).catch(() => null);
  }

  revalidatePath("/deliverables");
  revalidatePath("/executions");
  revalidatePath("/");
}
