"use server";

import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { logEvent } from "@/lib/kernel";

export type SignupState = { ok?: boolean; error?: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
const GENDERS = ["male", "female", "other", "unknown"];

/** FRANK GOLF 姫路 入会申込（店頭タブレット・公開ルート、店舗トークン検証、service_role経由） */
export async function submitSignup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const token = str(formData.get("token"));
  if (!token) return { error: "受付情報が見つかりません" };

  const admin = createAdmin();
  const { data: tok } = await admin
    .from("frunk_signup_tokens")
    .select("id, company_id, store_id, active")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!tok || !tok.active) return { error: "無効な入会URLです。スタッフにお声がけください" };

  const name = str(formData.get("name"));
  if (!name) return { error: "お名前を入力してください" };
  if (str(formData.get("consent_privacy")) !== "1") return { error: "個人情報の取扱いへの同意が必要です" };
  if (str(formData.get("consent_terms")) !== "1")
    return { error: "会員規約（休会・退会規定を含む）への同意が必要です" };
  const signature = str(formData.get("signature"));
  if (!signature) return { error: "ご署名をご記入ください" };

  const { error } = await admin.from("frunk_members").insert({
    company_id: tok.company_id as string,
    store_id: tok.store_id as string | null,
    plan_id: orNull(formData.get("plan_id")),
    name,
    name_kana: orNull(formData.get("name_kana")),
    birth_date: orNull(formData.get("birth_date")),
    gender: GENDERS.includes(str(formData.get("gender"))) ? str(formData.get("gender")) : null,
    postal_code: orNull(formData.get("postal_code")),
    address1: orNull(formData.get("address")),
    phone: orNull(formData.get("phone")),
    email: orNull(formData.get("email")),
    occupation: orNull(formData.get("occupation")),
    contact_method: orNull(formData.get("contact_method")),
    payment_method: orNull(formData.get("payment_method")),
    start_date: orNull(formData.get("start_date")),
    consent_privacy: true,
    consent_terms: true,
    signature,
    status: "pending",
  });
  if (error) return { error: `送信に失敗しました: ${error.message}` };

  await logEvent(tok.company_id as string, {
    event_type: "frunk.signup",
    title: `FRANK入会申込: ${name} 様`,
    source: "tablet",
    source_type: "external",
    severity: "info",
  });
  return { ok: true };
}
