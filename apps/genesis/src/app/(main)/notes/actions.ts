"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/** 社内連絡ノート（役員→古川 / migration 0040）。書込みは view_hq 保持者なら誰でも */
export async function postMessage(body: string): Promise<{ error?: string }> {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const text = body.trim();
  if (!text) return { error: "内容を入力してください" };
  const { error } = await admin.from("gn_messages").insert({
    company_id: actor.companyId,
    from_staff_id: actor.staffId,
    body: text.slice(0, 4000),
  });
  if (error) return { error: error.message };
  revalidatePath("/notes");
  return {};
}

/** 対応済み/未対応の切替（返信メモも同時に保存できる） */
export async function resolveMessage(id: string, reply?: string): Promise<{ error?: string }> {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data: msg } = await admin
    .from("gn_messages")
    .select("id, status")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!msg) return { error: "見つかりません" };
  const done = msg.status !== "done";
  const { error } = await admin
    .from("gn_messages")
    .update({
      status: done ? "done" : "open",
      reply: reply?.trim() ? reply.trim().slice(0, 2000) : undefined,
      replied_by: done ? actor.staffId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", msg.id);
  if (error) return { error: error.message };
  revalidatePath("/notes");
  return {};
}
