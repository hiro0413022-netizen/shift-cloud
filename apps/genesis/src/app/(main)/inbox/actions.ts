"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";
import { generateDraftReply, generateMissingDrafts, applyFilterRules } from "@/lib/secretary";

/**
 * 返信案を承認 → status=approved（送信予約）。
 * 送信の実体:
 *   - source=gmail → 秘書スケジュールタスク（ceo-ai-secretary）が承認済みを拾って送信
 *   - source=line  → n8n「LINE返信送信」ワークフローが承認済みを拾ってPush送信
 * どちらも status='approved' の行だけを送る（VISION §7: 外部送信は承認必須）。
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

  // 文面が空のまま承認されると「空メッセージを送る」事故になるので止める
  const finalReply = reply || String(before.ai_draft_reply ?? "").trim();
  if (!finalReply) return;

  const after = {
    status: "approved",
    ai_draft_reply: finalReply,
    decided_by: actor.staffId,
    decided_at: new Date().toISOString(),
    reply_error: null,
  };
  await admin.from("sec_inquiries").update(after).eq("id", id).eq("company_id", actor.companyId);

  await logAudit(actor, "inquiry.approve", "sec_inquiries", id, before, after);
  await logEvent(actor.companyId, {
    event_type: "inquiry.approved",
    title: `返信を承認（${String(before.source) === "line" ? "LINE送信予約" : "メール送信予約"}）: ${String(
      before.from_name ?? before.from_email ?? "問い合わせ"
    )}`.slice(0, 120),
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

/** この1件の返信案をAIに作らせる（承認前の下書き） */
export async function draftReply(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await generateDraftReply(actor.companyId, id);
  revalidatePath("/inbox");
}

/** 未対応で下書きが無いものに、まとめて返信案を作る */
export async function draftAllReplies() {
  const actor = await requireGenesisActor();
  const n = await generateMissingDrafts(actor.companyId, 10);
  await logEvent(actor.companyId, {
    event_type: "inquiry.drafts_generated",
    title: `返信案を一括生成: ${n}件`,
    source: "ceo_inbox",
    source_type: "ai",
  });
  revalidatePath("/inbox");
}

/* ---------- 受信フィルタ（リッチメニュー等を対応要件から外す / 0045） ---------- */

export async function addFilterRule(formData: FormData) {
  const actor = await requireGenesisActor();
  const pattern = String(formData.get("pattern") ?? "").trim();
  const matchType = String(formData.get("match_type") ?? "exact");
  const source = String(formData.get("source") ?? "line");
  const label = String(formData.get("label") ?? "リッチメニュー").trim();
  if (!pattern) return;

  const admin = createAdmin();
  await admin.from("sec_filter_rules").insert({
    company_id: actor.companyId,
    source: ["line", "gmail", "any"].includes(source) ? source : "line",
    pattern,
    match_type: ["exact", "contains", "prefix"].includes(matchType) ? matchType : "exact",
    label: label || null,
    action: "noise",
    created_by: actor.staffId,
  });
  await applyFilterRules(actor.companyId); // 既存の滞留にも即適用
  await logAudit(actor, "filter_rule.add", "sec_filter_rules", null, null, { pattern, matchType, source });
  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function deleteFilterRule(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdmin();
  await admin
    .from("sec_filter_rules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  await logAudit(actor, "filter_rule.delete", "sec_filter_rules", id, null, null);
  revalidatePath("/inbox");
}
