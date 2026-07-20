"use server";

import { createAdmin } from "@/lib/supabase/admin";
import { resolveHimeji } from "@/lib/member";
import { logEvent } from "@/lib/kernel";

export type WebSignupState = { ok?: boolean; error?: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
const GENDERS = ["male", "female", "other", "unknown"];

/**
 * FRANK GOLF 姫路 Web入会申込（公開フォーム・トークン不要・service_role経由）。
 * 署名は取らず、同意チェックで受付。status='pending' で登録し、
 * スタッフが /frunk（FRANK会員）で承認 → 会員番号発行 → 在籍(active) となる。
 * （既存の店頭タブレット入会 /join/[token] と同じ承認フローに合流）
 */
export async function submitWebSignup(_prev: WebSignupState, formData: FormData): Promise<WebSignupState> {
  const store = await resolveHimeji();
  if (!store) return { error: "店舗情報が見つかりません。時間をおいて再度お試しください。" };

  const name = str(formData.get("name"));
  if (!name) return { error: "お名前を入力してください" };
  if (!str(formData.get("plan_id"))) return { error: "ご希望のプランをお選びください" };
  const phone = str(formData.get("phone"));
  const email = str(formData.get("email"));
  if (!phone && !email) return { error: "電話番号またはメールアドレスのいずれかをご入力ください" };
  if (str(formData.get("consent_privacy")) !== "1") return { error: "個人情報の取扱いへの同意が必要です" };
  if (str(formData.get("consent_terms")) !== "1")
    return { error: "会員規約（休会・退会規定を含む）への同意が必要です" };

  const admin = createAdmin();

  // プランが当該会社のものか検証
  const { data: plan } = await admin
    .from("frunk_plans")
    .select("id")
    .eq("id", str(formData.get("plan_id")))
    .eq("company_id", store.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!plan) return { error: "選択されたプランが無効です。画面を更新して再度お試しください。" };

  const { error } = await admin.from("frunk_members").insert({
    company_id: store.companyId,
    store_id: store.storeId,
    plan_id: plan.id,
    name,
    name_kana: orNull(formData.get("name_kana")),
    birth_date: orNull(formData.get("birth_date")),
    gender: GENDERS.includes(str(formData.get("gender"))) ? str(formData.get("gender")) : null,
    postal_code: orNull(formData.get("postal_code")),
    address1: orNull(formData.get("address")),
    phone: phone || null,
    email: email || null,
    payment_method: orNull(formData.get("payment_method")),
    start_date: orNull(formData.get("start_date")),
    consent_privacy: true,
    consent_terms: true,
    note: "Web入会申込（公式サイト）",
    status: "pending",
  });
  if (error) return { error: `送信に失敗しました: ${error.message}` };

  await logEvent(store.companyId, {
    event_type: "frunk.signup",
    title: `Web入会申込: ${name} 様`,
    source: "web",
    source_type: "external",
    severity: "info",
  });
  return { ok: true };
}
