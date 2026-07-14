"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { issueDirective, updateDirectiveStatus, type DirectiveTarget } from "@/lib/directives";
import { logAudit } from "@/lib/kernel";

/** 実行指示を新規発行（宛先: スタッフ / AI社員 / 外部送信の承認） */
export async function createDirective(formData: FormData) {
  const actor = await requireGenesisActor();
  const targetKind = String(formData.get("target_kind") ?? "") as DirectiveTarget;
  if (!["staff", "ai_agent", "external"].includes(targetKind)) return;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const id = await issueDirective(actor, {
    target_kind: targetKind,
    staff_id: String(formData.get("staff_id") ?? "") || null,
    agent_id: String(formData.get("agent_id") ?? "") || null,
    title,
    body: String(formData.get("body") ?? "") || null,
    due_date: String(formData.get("due_date") ?? "") || null,
    priority: (["high", "normal", "low"].includes(String(formData.get("priority")))
      ? String(formData.get("priority"))
      : "normal") as "high" | "normal" | "low",
    origin_kind: "manual",
  });

  await logAudit(actor, "directive.issue", "gn_directives", id, null, { targetKind, title });
  revalidatePath("/directives");
  revalidatePath("/");
}

/** 指示のステータス変更（対応中 / 完了 / 取消） */
export async function setDirectiveStatus(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const result = String(formData.get("result") ?? "") || undefined;
  if (!id || !["in_progress", "done", "cancelled"].includes(status)) return;

  await updateDirectiveStatus(actor, id, status as "in_progress" | "done" | "cancelled", result);
  await logAudit(actor, `directive.${status}`, "gn_directives", id, null, { result });
  revalidatePath("/directives");
  revalidatePath("/");
}
