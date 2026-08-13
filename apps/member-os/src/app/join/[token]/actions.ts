"use server";

import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { logEvent } from "@/lib/kernel";
import { joinAddress } from "@/lib/address";
import { readName } from "@/lib/name";

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

  const { name, nameKana } = readName(formData);
  if (!name) return { error: "お名前（姓・名）を入力してください" };

  // プランの実在・会社スコープ検証（#136。/join-web と同等。POST直打ちで
  // 他社・削除済み・非公開プランのIDを指定できてしまっていた）
  let planId: string | null = null;
  {
    const raw = orNull(formData.get("plan_id"));
    if (raw) {
      const { data: plan } = await admin
        .from("frunk_plans")
        .select("id, active")
        .eq("id", raw)
        .eq("company_id", tok.company_id as string)
        .is("deleted_at", null)
        .maybeSingle();
      if (!plan || !plan.active) return { error: "選択されたプランが無効です。画面を更新して再度お試しください" };
      planId = String(plan.id);
    }
  }
  if (str(formData.get("consent_privacy")) !== "1") return { error: "個人情報の取扱いへの同意が必要です" };
  if (str(formData.get("consent_terms")) !== "1")
    return { error: "会員規約（休会・退会規定を含む）への同意が必要です" };
  const signature = str(formData.get("signature"));
  if (!signature) return { error: "ご署名をご記入ください" };

  const { error } = await admin.from("frunk_members").insert({
    company_id: tok.company_id as string,
    store_id: tok.store_id as string | null,
    plan_id: planId,
    name,
    name_kana: nameKana,
    birth_date: orNull(formData.get("birth_date")),
    gender: GENDERS.includes(str(formData.get("gender"))) ? str(formData.get("gender")) : null,
    postal_code: orNull(formData.get("postal_code")),
    // frunk_membersは都道府県列を持たないため、1行に結合して保存する
    address1: joinAddress(
      formData.get("prefecture") as string | null,
      (formData.get("address1") as string | null) ?? (formData.get("address") as string | null),
      formData.get("building") as string | null
    ),
    phone: orNull(formData.get("phone")),
    email: orNull(formData.get("email")),
    occupation: orNull(formData.get("occupation")),
    contact_method: orNull(formData.get("contact_method")),
    // 月会費はクレジットカード（Square自動課金）の一本化。フォームから選ばせない
    payment_method: "credit",
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
