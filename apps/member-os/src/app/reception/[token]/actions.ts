"use server";

import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { logEvent } from "@/lib/kernel";

export type ReceptionState = { ok?: boolean; error?: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function list(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((v) => String(v).trim()).filter(Boolean);
}

const VISIT_TYPES = ["trial", "fitting", "bay", "visitor_bay", "other"];
const GENDERS = ["male", "female", "other", "unknown"];

/** 店頭常設タブレットからの自己入力（予約不要・店舗トークン検証、service_role経由 DECISIONS #12/#28） */
export async function submitReception(
  _prev: ReceptionState,
  formData: FormData
): Promise<ReceptionState> {
  const token = str(formData.get("token"));
  if (!token) return { error: "受付情報が見つかりません" };

  const admin = createAdmin();
  const { data: tok } = await admin
    .from("mbr_walkin_tokens")
    .select("id, company_id, store_id, active")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!tok || !tok.active) return { error: "無効な受付URLです。スタッフにお声がけください" };

  // 姓・名を分割入力（Excelで「姓 名」に整形）。旧nameフィールドにもフォールバック。
  const familyName = str(formData.get("family_name"));
  const givenName = str(formData.get("given_name"));
  const name = [familyName, givenName].filter(Boolean).join(" ") || str(formData.get("name"));
  if (!name) return { error: "お名前を入力してください" };
  const visitType = VISIT_TYPES.includes(str(formData.get("visit_type")))
    ? str(formData.get("visit_type"))
    : "trial";
  if (str(formData.get("consent")) !== "1")
    return { error: "個人情報の取扱いへの同意が必要です" };

  const guestPayload = {
    company_id: tok.company_id as string,
    store_id: tok.store_id as string | null,
    name,
    name_kana: orNull(formData.get("name_kana")),
    gender: GENDERS.includes(str(formData.get("gender"))) ? str(formData.get("gender")) : null,
    birth_date: orNull(formData.get("birth_date")),
    postal_code: orNull(formData.get("postal_code")),
    address1: orNull(formData.get("address")),
    phone: orNull(formData.get("phone")),
    email: orNull(formData.get("email")),
    occupation: orNull(formData.get("occupation")),
    contact_method: orNull(formData.get("contact_method")),
  };

  const { data: guest } = await admin.from("mbr_guests").insert(guestPayload).select("id").single();

  const survey = {
    trial_reasons: list(formData, "trial_reasons"),
    fitting_reasons: list(formData, "fitting_reasons"),
    school_goals: list(formData, "school_goals"),
    join_interest: orNull(formData.get("join_interest")),
    comment: orNull(formData.get("comment")),
  };

  await admin.from("mbr_walkin_visits").insert({
    company_id: tok.company_id as string,
    store_id: tok.store_id as string | null,
    guest_id: guest?.id ?? null,
    visited_on: new Date().toISOString().slice(0, 10),
    visit_type: visitType,
    referral_source: orNull(formData.get("referral_source")),
    referral_source_other: orNull(formData.get("referral_source_other")),
    survey,
    consent_at: new Date().toISOString(),
    signature: orNull(formData.get("signature")),
  });

  await logEvent(tok.company_id as string, {
    event_type: "member.walkin_intake",
    title: `一時利用の受付入力が完了: ${name} 様（${visitType}）`,
    source: "tablet",
    source_type: "external",
    severity: "info",
  });

  return { ok: true };
}
