"use server";

import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { logEvent } from "@/lib/kernel";
import { normalizeAddress } from "@/lib/address";
import { readName } from "@/lib/name";

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

/** お客様が書いた個人情報（mbr_guests の列）。新規作成と、予約由来の追記で同じ形を使う */
function readGuestFields(formData: FormData): Record<string, unknown> {
  const { name, nameKana } = readName(formData);
  // 都道府県は欄が空でも住所の先頭から補完する（旧フォーム由来のnull防止）
  const addr = normalizeAddress(
    orNull(formData.get("prefecture")),
    orNull(formData.get("address1")) ?? orNull(formData.get("address"))
  );
  return {
    name,
    name_kana: nameKana,
    gender: GENDERS.includes(str(formData.get("gender"))) ? str(formData.get("gender")) : null,
    birth_date: orNull(formData.get("birth_date")),
    postal_code: orNull(formData.get("postal_code")),
    prefecture: addr.prefecture,
    address1: addr.address1,
    building: orNull(formData.get("building")),
    phone: orNull(formData.get("phone")),
    email: orNull(formData.get("email")),
    occupation: orNull(formData.get("occupation")),
    contact_method: orNull(formData.get("contact_method")),
  };
}

/** アンケート（利用区分で出し分け。JSONBに入れてExcel出力時に展開する） */
function readSurvey(formData: FormData): Record<string, unknown> {
  return {
    trial_reasons: list(formData, "trial_reasons"),
    fitting_reasons: list(formData, "fitting_reasons"),
    school_goals: list(formData, "school_goals"),
    join_interest: orNull(formData.get("join_interest")),
    comment: orNull(formData.get("comment")),
  };
}

/**
 * 店頭常設タブレットからの自己入力。
 *
 * 入り方は2つ（DECISIONS #186）:
 *   ① token      … 予約なしのご来店。台帳に新しい行とお客様を作る（従来どおり）
 *   ② visit_token … フィッティング予約からのご来店。**既に出来ている台帳の行に足す**。
 *      新しい行もお客様も作らない（作ると同じ人が2件になり、件数も購入率も狂う）。
 */
export async function submitReception(
  _prev: ReceptionState,
  formData: FormData
): Promise<ReceptionState> {
  const visitToken = str(formData.get("visit_token"));
  if (visitToken) return submitReservedReception(visitToken, formData);

  const token = str(formData.get("token"));
  if (!token) return { error: "受付情報が見つかりません" };

  const admin = createAdmin();
  const { data: tok } = await admin
    .from("mbr_walkin_tokens")
    .select("id, company_id, store_id, active")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!tok || !tok.active) return { error: "無効な受付URLです。スタッフにお声がけください" };

  const guestFields = readGuestFields(formData);
  if (!guestFields.name) return { error: "お名前を入力してください" };
  const visitType = VISIT_TYPES.includes(str(formData.get("visit_type")))
    ? str(formData.get("visit_type"))
    : "trial";
  if (str(formData.get("consent")) !== "1")
    return { error: "個人情報の取扱いへの同意が必要です" };

  const { data: guest } = await admin
    .from("mbr_guests")
    .insert({ company_id: tok.company_id as string, store_id: tok.store_id as string | null, ...guestFields })
    .select("id")
    .single();

  await admin.from("mbr_walkin_visits").insert({
    company_id: tok.company_id as string,
    store_id: tok.store_id as string | null,
    guest_id: guest?.id ?? null,
    visited_on: new Date().toISOString().slice(0, 10),
    visit_type: visitType,
    referral_source: orNull(formData.get("referral_source")),
    referral_source_other: orNull(formData.get("referral_source_other")),
    survey: readSurvey(formData),
    consent_at: new Date().toISOString(),
    signature: orNull(formData.get("signature")),
  });

  await logEvent(tok.company_id as string, {
    event_type: "member.walkin_intake",
    title: `一時利用の受付入力が完了: ${String(guestFields.name)} 様（${visitType}）`,
    source: "tablet",
    source_type: "external",
    severity: "info",
  });

  return { ok: true };
}

/**
 * 予約からのご来店（/reception/v/[intakeToken]）。
 * 台帳の行は予約確定の時点で出来ているので、**足りない欄を埋めるだけ**。
 * 予約でいただいた内容（survey.reserve）は残す。スタッフが書いた料金・成約にも触らない。
 */
async function submitReservedReception(rawToken: string, formData: FormData): Promise<ReceptionState> {
  const admin = createAdmin();
  const { data: visit } = await admin
    .from("mbr_walkin_visits")
    .select("id, company_id, store_id, guest_id, visit_type, survey, arrived_at, intake_token_expires_at, referral_source, referral_source_other")
    .eq("intake_token_hash", hashToken(rawToken))
    .is("deleted_at", null)
    .maybeSingle();

  if (!visit) return { error: "この受付URLは使用済みか無効です。スタッフにお声がけください" };
  const exp = visit.intake_token_expires_at ? Date.parse(String(visit.intake_token_expires_at)) : 0;
  if (!exp || exp < Date.now())
    return { error: "受付URLの有効期限が切れています。スタッフにお声がけください" };

  const guestFields = readGuestFields(formData);
  if (!guestFields.name) return { error: "お名前を入力してください" };
  if (str(formData.get("consent")) !== "1")
    return { error: "個人情報の取扱いへの同意が必要です" };

  const companyId = visit.company_id as string;
  const storeId = (visit.store_id as string | null) ?? null;

  // お客様: 予約確定の時に紐づけた既存のお客様に追記する（新しく作らない）
  let guestId = (visit.guest_id as string | null) ?? null;
  if (guestId) {
    await admin
      .from("mbr_guests")
      .update({ ...guestFields, updated_at: new Date().toISOString() })
      .eq("id", guestId);
  } else {
    const { data: guest } = await admin
      .from("mbr_guests")
      .insert({ company_id: companyId, store_id: storeId, ...guestFields })
      .select("id")
      .single();
    guestId = guest?.id ?? null;
  }

  // 予約でいただいた内容（survey.reserve）は上書きしない
  const prevSurvey = (visit.survey ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  const { error } = await admin
    .from("mbr_walkin_visits")
    .update({
      guest_id: guestId,
      // お客様が選ばなかったら、予約確定時に入れた流入元（「ホームページ」等）を消さない
      referral_source: orNull(formData.get("referral_source")) ?? (visit.referral_source as string | null),
      referral_source_other:
        orNull(formData.get("referral_source_other")) ?? (visit.referral_source_other as string | null),
      survey: { ...prevSurvey, ...readSurvey(formData) },
      consent_at: now,
      signature: orNull(formData.get("signature")),
      arrived_at: visit.arrived_at ?? now,
      // 使い終わった鍵は捨てる（1回きり）
      intake_token_hash: null,
      intake_token_expires_at: null,
      updated_at: now,
    })
    .eq("id", visit.id as string);
  if (error) return { error: error.message };

  await logEvent(companyId, {
    event_type: "member.walkin_intake",
    title: `予約からの受付入力が完了: ${String(guestFields.name)} 様（${String(visit.visit_type)}）`,
    source: "tablet",
    source_type: "external",
    severity: "info",
  });

  return { ok: true };
}
