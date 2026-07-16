"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { enqueueAction, cancelAction, approveAction, rejectAction, runDueActions } from "@/lib/ai-execution";

/** 動作確認: 無害なテストアクションを取消枠つきで投入（company_eventsに残すだけ） */
export async function enqueueTestAction() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  await enqueueAction(admin, {
    companyId: actor.companyId,
    actionType: "test_notify",
    title: `テスト実行 ${new Date().toLocaleString("ja-JP")}`,
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

/** 今すぐ実行キューを回す（cronを待たずに確認したいとき） */
export async function runNow() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  await runDueActions(admin, actor.companyId);
  revalidatePath("/executions");
}
