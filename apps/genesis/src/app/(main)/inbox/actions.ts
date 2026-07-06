"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

/**
 * 返信案を承認 → status=approved（送信予約）。
 * 実際の送信は秘書エンジン（定期タスク）が承認済みを拾って行う（VISION §7: 外部送信は承認必須）。
 * 文面はこの画面で編集された内容で確定する。
 */
export async function approveInquiry(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();
  if (!id) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("sec_inquiries")
    .select("*")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before || !["new", "awaiting_approval"].includes(String(before.status))) return;

  const after = {
    status: "approved",
    ai_draft_reply: reply || before.ai_draft_reply,
    decided_by: actor.staffId,
    decided_at: new Date().toISOString(),
  };
  await admin.from("sec_inquiries").update(after).eq("id", id).eq("company_id", actor.companyId);

  await logAudit(actor, "inquiry.approve", "sec_inquiries", id, before, after);
  await logEvent(actor.companyId, {
    event_type: "inquiry.approved",
    title: `返信を承認（送信予約）: ${String(before.from_name ?? before.from_email ?? "問い合わせ")} / ${String(before.subject ?? "")}`.slice(0, 120),
    source: "ceo_inbox",
    source_type: "human",
  });
  revalidatePath("/inbox");
  revalidatePath("/command");
  revalidatePath("/");
}

/** 問い合わせを保留（今は対応しない） */
export async function dismissInquiry(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("sec_inquiries")
    .select("*")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before) return;

  const after = { status: "dismissed", decided_by: actor.staffId, decided_at: new Date().toISOString() };
  await admin.from("sec_inquiries").update(after).eq("id", id).eq("company_id", actor.companyId);

  await logAudit(actor, "inquiry.dismiss", "sec_inquiries", id, before, after);
  revalidatePath("/inbox");
  revalidatePath("/command");
}

/** 種別・優先度を手動修正（AI分類の訂正用） */
export async function reclassifyInquiry(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const inquiryType = String(formData.get("inquiry_type") ?? "");
  const priority = String(formData.get("priority") ?? "");
  if (!id) return;

  const patch: Record<string, string> = {};
  if (["system_request", "apparel", "b2b", "other", "noise"].includes(inquiryType)) patch.inquiry_type = inquiryType;
  if (["high", "normal", "low"].includes(priority)) patch.priority = priority;
  if (Object.keys(patch).length === 0) return;

  const admin = createAdmin();
  await admin.from("sec_inquiries").update(patch).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "inquiry.reclassify", "sec_inquiries", id, null, patch);
  revalidatePath("/inbox");
}
