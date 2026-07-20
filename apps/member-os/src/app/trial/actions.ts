"use server";

import { createAdmin } from "@/lib/supabase/admin";
import { resolveHimeji } from "@/lib/member";
import { logEvent } from "@/lib/kernel";

export type TrialState = { ok?: boolean; error?: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

/** FRANK GOLF 姫路 体験申込（公開フォーム・トークン不要・service_role経由） */
export async function submitTrial(_prev: TrialState, formData: FormData): Promise<TrialState> {
  const store = await resolveHimeji();
  if (!store) return { error: "店舗情報が見つかりません。時間をおいて再度お試しください。" };

  const name = str(formData.get("name"));
  if (!name) return { error: "お名前を入力してください" };
  const phone = str(formData.get("phone"));
  const email = str(formData.get("email"));
  if (!phone && !email) return { error: "電話番号またはメールアドレスのいずれかをご入力ください" };
  if (!str(formData.get("pref1"))) return { error: "第1希望日時をご入力ください" };
  if (str(formData.get("consent_privacy")) !== "1")
    return { error: "個人情報の取扱いへの同意が必要です" };

  const admin = createAdmin();
  const { error } = await admin.from("mbr_trial_requests").insert({
    company_id: store.companyId,
    store_id: store.storeId,
    name,
    name_kana: orNull(formData.get("name_kana")),
    phone: phone || null,
    email: email || null,
    pref1: orNull(formData.get("pref1")),
    pref2: orNull(formData.get("pref2")),
    pref3: orNull(formData.get("pref3")),
    experience: orNull(formData.get("experience")),
    message: orNull(formData.get("message")),
    consent_privacy: true,
    source: "web",
    status: "pending",
  });
  if (error) return { error: `送信に失敗しました: ${error.message}` };

  await logEvent(store.companyId, {
    event_type: "trial.request",
    title: `体験申込: ${name} 様（第1希望 ${str(formData.get("pref1"))}）`,
    source: "web",
    source_type: "external",
    severity: "info",
  });
  return { ok: true };
}
