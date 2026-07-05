"use server";

import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { logEvent } from "@/lib/kernel";

export type IntakeState = { ok?: boolean; error?: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

/** タブレット自己入力の送信（顧客向け・トークン検証必須、service_role経由 DECISIONS #11/#12） */
export async function submitIntake(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const token = str(formData.get("token"));
  if (!token) return { error: "受付情報が見つかりません" };

  const admin = createAdmin();
  const { data: tok } = await admin
    .from("mbr_intake_tokens")
    .select("id, company_id, booking_id, used_at, expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!tok) return { error: "無効な受付URLです。スタッフにお声がけください" };
  if (tok.used_at) return { error: "この受付は既に完了しています" };
  if (new Date(tok.expires_at as string).getTime() < Date.now())
    return { error: "受付URLの有効期限が切れています。スタッフにお声がけください" };

  const name = str(formData.get("name"));
  if (!name) return { error: "お名前を入力してください" };
  if (str(formData.get("consent")) !== "1")
    return { error: "個人情報の取扱いへの同意が必要です" };

  const survey = {
    golf_experience: orNull(formData.get("golf_experience")),
    trigger: orNull(formData.get("trigger")),
    purpose: orNull(formData.get("purpose")),
    issue: orNull(formData.get("issue")),
  };

  const guestPayload = {
    company_id: tok.company_id as string,
    name,
    name_kana: orNull(formData.get("name_kana")),
    gender: ["male", "female", "other"].includes(str(formData.get("gender"))) ? str(formData.get("gender")) : null,
    birth_date: orNull(formData.get("birth_date")),
    postal_code: orNull(formData.get("postal_code")),
    prefecture: orNull(formData.get("prefecture")),
    address1: orNull(formData.get("address1")),
    building: orNull(formData.get("building")),
    phone: orNull(formData.get("phone")),
    mobile: orNull(formData.get("mobile")),
    email: orNull(formData.get("email")),
    dm_ok: str(formData.get("dm_ok")) === "1",
    survey,
  };

  // 予約に紐づく既存guestがあれば更新、なければ作成
  const { data: booking } = await admin
    .from("mbr_trial_bookings")
    .select("id, guest_id, status")
    .eq("id", tok.booking_id as string)
    .single();

  let guestId = booking?.guest_id as string | null;
  if (guestId) {
    await admin.from("mbr_guests").update(guestPayload).eq("id", guestId);
  } else {
    const { data: g } = await admin.from("mbr_guests").insert(guestPayload).select("id").single();
    guestId = g?.id ?? null;
  }

  const signature = orNull(formData.get("signature"));
  await admin
    .from("mbr_trial_bookings")
    .update({
      guest_id: guestId,
      consent_at: new Date().toISOString(),
      signature,
      status: booking?.status === "reserved" ? "visited" : (booking?.status as string),
    })
    .eq("id", tok.booking_id as string);

  await admin.from("mbr_intake_tokens").update({ used_at: new Date().toISOString() }).eq("id", tok.id as string);

  await logEvent(tok.company_id as string, {
    event_type: "member.intake_completed",
    title: `体験受付の自己入力が完了: ${name} 様`,
    source: "tablet",
    source_type: "external",
    severity: "info",
  });

  return { ok: true };
}
