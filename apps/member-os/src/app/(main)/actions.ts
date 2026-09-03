"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";
import { hashToken, generateToken } from "@/lib/intake";
import { normalizeAddress } from "@/lib/address";
import { scopedStoreId, requireStoreAccess } from "@/lib/store-scope";

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

/** 対象の来店行が自分の店舗のものか確かめる（#134）。
 *  company_id だけでは他店舗の行を平気で書き換えられてしまうため、更新前に store_id を読んで検証する。 */
async function loadOwnVisit(
  admin: ReturnType<typeof createAdmin>,
  actor: { isOwner: boolean; storeIds: string[]; primaryStoreId: string | null; companyId: string },
  id: string,
): Promise<{ id: string; guest_id: string | null; store_id: string | null } | null> {
  const { data } = await admin
    .from("mbr_walkin_visits")
    .select("id, guest_id, store_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  requireStoreAccess(actor, data.store_id as string | null);
  return data as { id: string; guest_id: string | null; store_id: string | null };
}

const VISIT_TYPES = ["trial", "fitting", "bay", "visitor_bay", "other"];
const RESULTS = ["none", "join", "purchase"];
const PAYMENTS = ["store", "web", "free_campaign", "other"];
const GENDERS = ["male", "female", "other", "unknown"];

/** スタッフが手動で一時利用を登録（電話・当日の飛び込み等、タブレット未使用時） */
export async function createVisitManual(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();

  const visitType = VISIT_TYPES.includes(str(formData.get("visit_type"))) ? str(formData.get("visit_type")) : "trial";
  const visitedOn = orNull(formData.get("visited_on"));
  const name = orNull(formData.get("name"));
  const phone = orNull(formData.get("phone"));
  const storeId = scopedStoreId(actor, orNull(formData.get("store_id")));
  const nameKana = orNull(formData.get("name_kana"));
  const email = orNull(formData.get("email"));
  const occupation = orNull(formData.get("occupation"));
  const gender = str(formData.get("gender"));
  const note = orNull(formData.get("note"));
  // 都道府県は欄が空でも住所の先頭から補完する（旧フォーム由来のnull防止）
  const addr = normalizeAddress(
    orNull(formData.get("prefecture")),
    orNull(formData.get("address1")) ?? orNull(formData.get("address"))
  );
  if (!name && !phone) return; // 空送信ガード

  let guestId: string | null = null;
  if (name) {
    const { data: g } = await admin
      .from("mbr_guests")
      .insert({
        company_id: actor.companyId,
        store_id: storeId,
        name,
        phone,
        mobile: orNull(formData.get("mobile")),
        name_kana: nameKana,
        email,
        gender: GENDERS.includes(gender) ? gender : null,
        birth_date: orNull(formData.get("birth_date")),
        postal_code: orNull(formData.get("postal_code")),
        prefecture: addr.prefecture,
        address1: addr.address1,
        building: orNull(formData.get("building")),
        occupation,
        contact_method: orNull(formData.get("contact_method")),
        note,
      })
      .select("id")
      .single();
    guestId = g?.id ?? null;
  }

  const result = str(formData.get("result"));
  const payment = str(formData.get("payment_method"));
  const { data: visit } = await admin
    .from("mbr_walkin_visits")
    .insert({
      company_id: actor.companyId,
      store_id: storeId,
      guest_id: guestId,
      visited_on: visitedOn ?? new Date().toISOString().slice(0, 10),
      visit_type: visitType,
      fee: intOrNull(formData.get("fee")),
      discount: orNull(formData.get("discount")),
      payment_method: PAYMENTS.includes(payment) ? payment : null,
      pro_staff: orNull(formData.get("pro_staff")),
      result: RESULTS.includes(result) ? result : "none",
      reapproach_date: orNull(formData.get("reapproach_date")),
      reception_staff_id: actor.staffId,
      referral_source: orNull(formData.get("referral_source")),
      referral_source_other: orNull(formData.get("referral_source_other")),
      note,
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
  // 他店舗の来店行を書き換えさせない（#134）
  if (!(await loadOwnVisit(admin, actor, id))) return;

  const patch: Record<string, unknown> = {};
  // 来店日・利用区分も直せるようにした（#151）。
  // 日付を間違えて登録した／体験が別日に振り替わった、が今まで手で直せなかった。
  if (formData.has("visited_on")) {
    const d = str(formData.get("visited_on"));
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) patch.visited_on = d;
  }
  if (formData.has("visit_type")) {
    const t = str(formData.get("visit_type"));
    if (VISIT_TYPES.includes(t)) patch.visit_type = t;
  }
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
  patch.updated_at = new Date().toISOString(); // 保存のたびに更新→一覧のインライン欄が最新値で再描画される

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

/* ------------------------------------------------------------
   体験カウンセリング（紙シート → 受付台帳 / 2026-09-02）

   お客様が紙に書いた内容をスタッフが入力する。器は survey(jsonb) ＝ 列は増やさない。
   ⚠ survey には予約でいただいた内容（survey.reserve）やタブレットの回答が既に入っている。
     まるごと置き換えると消えるので **読んでからマージ** する（受付フォームと同じ作法）。
   ⑤⑥は紙と同じく最大2つ。画面でも止めるが、サーバーでも切り詰める（画面を信じない）。
   ------------------------------------------------------------ */
const GOLF_YEARS = ["未経験・始めたばかり", "1年未満", "1〜3年", "3〜10年", "10年以上"];
const PRACTICE_FREQ = ["ほぼしない", "月1〜2回", "週1回", "週2回以上"];
const ROUND_FREQ = ["ほぼしない", "月1回程度", "月2回以上"];
const AVG_SCORES = ["120以上", "110台", "100台", "90台", "80台以下", "まだコースに出たことがない"];
const IMPROVE_POINTS = [
  "ドライバー", "アイアン", "アプローチ", "飛距離アップ",
  "スライス・フックなど方向性", "スイングを基礎から整えたい", "スコアアップ", "その他",
];
const CHOOSE_FACTORS = [
  "通いやすさ", "完全個室", "シミュレーター・設備", "レッスンを受けられる",
  "好きな時間に練習できる", "落ち着いて練習できる", "料金", "その他",
];

/** 選択肢にあるものだけを最大2つまで通す（自由入力の混入と入れすぎを防ぐ） */
function picks(formData: FormData, key: string, allowed: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of formData.getAll(key)) {
    const s = String(v).trim();
    if (!allowed.includes(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 2) break;
  }
  return out;
}
function oneOf(formData: FormData, key: string, allowed: string[]): string | null {
  const s = str(formData.get(key));
  return allowed.includes(s) ? s : null;
}

export async function updateCounseling(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  if (!(await loadOwnVisit(admin, actor, id))) return;

  // 既存の survey を読んでからマージ（予約由来 survey.reserve / タブレット回答を消さない）
  const { data: cur } = await admin
    .from("mbr_walkin_visits")
    .select("survey")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  const prev = (cur?.survey ?? {}) as Record<string, unknown>;

  const survey = {
    ...prev,
    golf_years: oneOf(formData, "golf_years", GOLF_YEARS),
    practice_freq: oneOf(formData, "practice_freq", PRACTICE_FREQ),
    round_freq: oneOf(formData, "round_freq", ROUND_FREQ),
    practice_place: orNull(formData.get("practice_place")),
    avg_score: oneOf(formData, "avg_score", AVG_SCORES),
    improve_points: picks(formData, "improve_points", IMPROVE_POINTS),
    choose_factors: picks(formData, "choose_factors", CHOOSE_FACTORS),
    // ⑧「今日の体験で知りたいこと」は既存のコメント欄と同じ器（重複を作らない）
    comment: orNull(formData.get("comment")) ?? (prev.comment ?? null),
    counseled_at: new Date().toISOString(),
  };

  const patch: Record<string, unknown> = { survey, updated_at: new Date().toISOString() };
  // ⑦きっかけは既存の「何で知ったか」。カウンセリング欄からも直せるようにする
  if (formData.has("referral_source")) patch.referral_source = orNull(formData.get("referral_source"));
  if (formData.has("referral_source_other")) patch.referral_source_other = orNull(formData.get("referral_source_other"));

  await admin
    .from("mbr_walkin_visits")
    .update(patch)
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);

  await logAudit(actor, "walkin.counseling", "mbr_walkin_visits", id, null, survey);
  revalidatePath("/");
}

/** 受付台帳から顧客情報（住所・連絡先・職業など）を後追いで登録/編集。
 *  visitにguestが未紐付け（電話のみ登録等）の場合は新規guestを作成して紐付ける。 */
export async function updateGuest(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const visitId = str(formData.get("visit_id"));
  if (!visitId) return;

  // 対象visitとguest_idを会社＋店舗スコープで取得（#134・guestは紐づくvisit経由で店舗を判定する）
  const visit = await loadOwnVisit(admin, actor, visitId);
  if (!visit) return;

  const gender = str(formData.get("gender"));
  const addr = normalizeAddress(orNull(formData.get("prefecture")), orNull(formData.get("address1")));
  const fields = {
    name_kana: orNull(formData.get("name_kana")),
    gender: GENDERS.includes(gender) ? gender : null,
    birth_date: orNull(formData.get("birth_date")),
    postal_code: orNull(formData.get("postal_code")),
    prefecture: addr.prefecture,
    address1: addr.address1,
    building: orNull(formData.get("building")),
    phone: orNull(formData.get("phone")),
    mobile: orNull(formData.get("mobile")),
    email: orNull(formData.get("email")),
    occupation: orNull(formData.get("occupation")),
    contact_method: orNull(formData.get("contact_method")),
    guest_note: orNull(formData.get("guest_note")),
  };
  const name = orNull(formData.get("name"));

  if (visit.guest_id) {
    const patch: Record<string, unknown> = {
      ...fields,
      note: fields.guest_note,
      updated_at: new Date().toISOString(),
    };
    delete (patch as Record<string, unknown>).guest_note;
    if (name) patch.name = name; // NOT NULL列を空で潰さない
    await admin
      .from("mbr_guests")
      .update(patch)
      .eq("id", visit.guest_id)
      .eq("company_id", actor.companyId);
  } else {
    if (!name) return; // 新規作成には氏名が必要
    const { guest_note, ...rest } = fields;
    const { data: g } = await admin
      .from("mbr_guests")
      .insert({ company_id: actor.companyId, store_id: visit.store_id, name, note: guest_note, ...rest })
      .select("id")
      .single();
    if (g?.id) {
      await admin
        .from("mbr_walkin_visits")
        .update({ guest_id: g.id, updated_at: new Date().toISOString() })
        .eq("id", visitId)
        .eq("company_id", actor.companyId);
    }
  }

  await logAudit(actor, "guest.upsert", "mbr_guests", visit.guest_id ?? null, null, { visitId, name });
  await refreshMemberKpis(actor.companyId);
  revalidatePath("/");
}

/** 論理削除 */
export async function deleteVisit(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  // 他店舗の来店行を消させない（#134）
  if (!(await loadOwnVisit(admin, actor, id))) return;
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
  const storeId = scopedStoreId(actor, orNull(formData.get("store_id")));
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
