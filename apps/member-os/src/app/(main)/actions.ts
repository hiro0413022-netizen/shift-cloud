"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";
import { hashToken, generateToken } from "@/lib/intake";

async function refreshMemberKpis(companyId: string) {
  const admin = createAdmin();
  await admin.rpc("refresh_member_kpis", { p_company_id: companyId });
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = str(v).replace(/[^\d-]/g, "");
  return s === "" ? null : parseInt(s, 10);
}

const VISIT_TYPES = ["trial", "fitting", "bay", "visitor_bay", "other"];
const RESULTS = ["none", "join", "purchase"];
const PAYMENTS = ["store", "web", "free_campaign", "other"];

/** スタッフが手動で一時利用を登録（電話・当日の飛び込み等、タブレット未使用時） */
export async function createVisitManual(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();

  const visitType = VISIT_TYPES.includes(str(formData.get("visit_type"))) ? str(formData.get("visit_type")) : "trial";
  const visitedOn = orNull(formData.get("visited_on"));
  const name = orNull(formData.get("name"));
  const phone = orNull(formData.get("phone"));
  const storeId = orNull(formData.get("store_id"));
  if (!name && !phone) return; // 空送信ガード

  let guestId: string | null = null;
  if (name) {
    const { data: g } = await admin
      .from("mbr_guests")
      .insert({ company_id: actor.companyId, store_id: storeId, name, phone })
      .select("id")
      .single();
    guestId = g?.id ?? null;
  }

  const { data: visit } = await admin
    .from("mbr_walkin_visits")
    .insert({
      company_id: actor.companyId,
      store_id: storeId,
      guest_id: guestId,
      visited_on: visitedOn ?? new Date().toISOString().slice(0, 10),
      visit_type: visitType,
      fee: intOrNull(formData.get("fee")),
      reception_staff_id: actor.staffId,
      referral_source: orNull(formData.get("referral_source")),
      created_by: actor.staffId,
    })
    .select("id")
    .single();

  await logAudit(actor, "walkin.create", "mbr_walkin_visits", visit?.id ?? null, null, { visitType, name });
  await logEvent(actor.companyId, {
    event_type: "member.walkin_manual",
    title: `一時利用を登録: ${name ?? "（氏名未登録）"}（${visitType}）`,
    source: "member-os", source_type: "human", severity: "info",
  });
  await refreshMemberKpis(actor.companyId);
  revalidatePath("/");
}

/** スタッフによる追記（利用料/割引/支払/担当プロ/成約/フォロー等） */
export async function updateVisit(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const patch: Record<string, unknown> = {};
  if (formData.has("fee")) patch.fee = intOrNull(formData.get("fee"));
  if (formData.has("discount")) patch.discount = orNull(formData.get("discount"));
  if (formData.has("payment_method")) {
    const p = str(formData.get("payment_method"));
    patch.payment_method = PAYMENTS.includes(p) ? p : null;
  }
  if (formData.has("pro_staff")) patch.pro_staff = orNull(formData.get("pro_staff"));
  if (formData.has("result")) {
    const r = str(formData.get("result"));
    patch.result = RESULTS.includes(r) ? r : "none";
  }
  if (formData.has("repeat_date")) patch.repeat_date = orNull(formData.get("repeat_date"));
  if (formData.has("reapproach_date")) patch.reapproach_date = orNull(formData.get("reapproach_date"));
  if (formData.has("note")) patch.note = orNull(formData.get("note"));
  if (Object.keys(patch).length === 0) return;

  await admin
    .from("mbr_walkin_visits")
    .update(patch)
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);

  await logAudit(actor, "walkin.update", "mbr_walkin_visits", id, null, patch);
  if ("result" in patch) {
    await logEvent(actor.companyId, {
      event_type: patch.result === "join" ? "member.joined" : patch.result === "purchase" ? "member.purchased" : "member.result",
      title: patch.result === "join" ? "一時利用から入会が成立" : patch.result === "purchase" ? "フィッティングから購入が成立" : "成約結果を更新",
      source: "member-os", source_type: "human", severity: patch.result === "none" ? "info" : "notice",
    });
  }
  await refreshMemberKpis(actor.companyId);
  revalidatePath("/");
}

/** 論理削除 */
export async function deleteVisit(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin
    .from("mbr_walkin_visits")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  await logAudit(actor, "walkin.delete", "mbr_walkin_visits", id);
  await refreshMemberKpis(actor.companyId);
  revalidatePath("/");
}

/** 店頭常設タブレットの受付URLを発行（店舗単位・長期有効。生URLは発行直後に一度だけ表示） */
export async function issueStoreToken(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const storeId = orNull(formData.get("store_id"));
  const label = orNull(formData.get("label"));

  // 既存の同店舗トークンを無効化（1店舗1URL運用）
  await admin
    .from("mbr_walkin_tokens")
    .update({ active: false })
    .eq("company_id", actor.companyId)
    .eq("store_id", storeId ?? "")
    .eq("active", true);

  const token = generateToken();
  await admin.from("mbr_walkin_tokens").insert({
    company_id: actor.companyId,
    store_id: storeId,
    token_hash: hashToken(token),
    label,
    created_by: actor.staffId,
  });
  await logAudit(actor, "walkin.token_issue", "mbr_walkin_tokens", null, null, { storeId, label });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/reception/${token}`;
  redirect(`/?reception_url=${encodeURIComponent(url)}`);
}
