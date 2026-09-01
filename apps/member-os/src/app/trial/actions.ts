"use server";

import { createAdmin } from "@/lib/supabase/admin";
import { resolveHimeji } from "@/lib/member";
import { logEvent } from "@/lib/kernel";
import { readName } from "@/lib/name";
import { sendFrankMail, buildTrialRequestReceiptMail } from "@/lib/frank-mail";
import { birthDateError } from "@yozan/core/birth-date";
import { jstYmd } from "@/lib/jst";

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

  const { name, nameKana } = readName(formData);
  if (!name) return { error: "お名前（姓・名）を入力してください" };
  const phone = str(formData.get("phone"));
  const email = str(formData.get("email"));
  if (!phone && !email) return { error: "電話番号またはメールアドレスのいずれかをご入力ください" };
  // 生年月日は必須（#190・ユーザー指示）。判定は公式サイト側と同じ規則（@yozan/core/birth-date）
  const birthDate = str(formData.get("birth_date"));
  const birthErr = birthDateError(birthDate, jstYmd());
  if (birthErr) return { error: birthErr };
  if (!str(formData.get("pref1"))) return { error: "第1希望日時をご入力ください" };
  if (str(formData.get("consent_privacy")) !== "1")
    return { error: "個人情報の取扱いへの同意が必要です" };

  const admin = createAdmin();
  const { error } = await admin.from("mbr_trial_requests").insert({
    company_id: store.companyId,
    store_id: store.storeId,
    name,
    name_kana: nameKana,
    birth_date: birthDate,
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

  // 受付メール（メールアドレスがある場合のみ。送信失敗で申込は落とさない）
  if (email) {
    const mail = buildTrialRequestReceiptMail({
      name,
      pref1: orNull(formData.get("pref1")),
      pref2: orNull(formData.get("pref2")),
      pref3: orNull(formData.get("pref3")),
    });
    await sendFrankMail({ to: email, ...mail });
  }
  return { ok: true };
}
