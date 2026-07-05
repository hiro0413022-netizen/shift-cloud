"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";
import { hashToken, generateToken, INTAKE_TOKEN_TTL_HOURS } from "@/lib/intake";

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

const SOURCES = ["hp", "phone", "walkin", "referral", "sns", "other"];
const STATUSES = ["reserved", "visited", "canceled", "no_show"];

/** 体験予約を作成（スタッフ入力）。氏名を入れれば見込み客も同時登録 */
export async function createBooking(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const storeId = orNull(formData.get("store_id"));
  const program = orNull(formData.get("program"));
  const lessonDate = orNull(formData.get("lesson_date"));
  const startTime = orNull(formData.get("start_time"));
  const endTime = orNull(formData.get("end_time"));
  const bay = orNull(formData.get("bay"));
  const staffId = orNull(formData.get("staff_id"));
  const source = SOURCES.includes(str(formData.get("source"))) ? str(formData.get("source")) : "walkin";
  const guestName = orNull(formData.get("guest_name"));
  const guestMobile = orNull(formData.get("guest_mobile"));

  if (!program && !lessonDate && !guestName) return; // 空送信ガード

  let guestId: string | null = null;
  if (guestName) {
    const { data: g } = await admin
      .from("mbr_guests")
      .insert({
        company_id: actor.companyId,
        store_id: storeId,
        name: guestName,
        mobile: guestMobile,
      })
      .select("id")
      .single();
    guestId = g?.id ?? null;
  }

  const { data: booking } = await admin
    .from("mbr_trial_bookings")
    .insert({
      company_id: actor.companyId,
      store_id: storeId,
      guest_id: guestId,
      program,
      lesson_date: lessonDate,
      start_time: startTime,
      end_time: endTime,
      bay,
      staff_id: staffId,
      source,
      status: "reserved",
      created_by: actor.staffId,
    })
    .select("id")
    .single();

  await logAudit(actor, "member.booking_create", "mbr_trial_bookings", booking?.id ?? null, null, {
    program,
    lessonDate,
    guestName,
  });
  await logEvent(actor.companyId, {
    event_type: "member.trial_booked",
    title: `体験予約を登録: ${guestName ?? "（氏名未登録）"}${lessonDate ? ` / ${lessonDate}` : ""}`,
    source: "genesis",
    source_type: "human",
    severity: "info",
  });
  await refreshMemberKpis(actor.companyId);
  revalidatePath("/members");
  revalidatePath("/");
}

/** 予約ステータス更新（来店 / キャンセル / no-show / 予約に戻す） */
export async function updateBookingStatus(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !STATUSES.includes(status)) return;

  await admin
    .from("mbr_trial_bookings")
    .update({ status })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);

  await logAudit(actor, "member.booking_status", "mbr_trial_bookings", id, null, { status });
  await refreshMemberKpis(actor.companyId);
  revalidatePath("/members");
  revalidatePath("/");
}

/** 入会可否の登録（入会 or 見送り＋理由） */
export async function setJoinResult(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const joined = str(formData.get("joined")) === "1";
  const declineReason = orNull(formData.get("decline_reason"));
  if (!id) return;

  await admin
    .from("mbr_trial_bookings")
    .update({
      joined,
      joined_at: joined ? new Date().toISOString().slice(0, 10) : null,
      decline_reason: joined ? null : declineReason,
      status: joined ? "visited" : undefined,
    })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);

  await logAudit(actor, "member.join_result", "mbr_trial_bookings", id, null, { joined });
  await logEvent(actor.companyId, {
    event_type: joined ? "member.joined" : "member.declined",
    title: joined ? "体験から入会が成立しました" : `体験見送り: ${declineReason ?? "理由未記入"}`,
    source: "genesis",
    source_type: "human",
    severity: joined ? "notice" : "info",
  });
  await refreshMemberKpis(actor.companyId);
  revalidatePath("/members");
  revalidatePath("/");
}

/** 論理削除 */
export async function deleteBooking(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin
    .from("mbr_trial_bookings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  await logAudit(actor, "member.booking_delete", "mbr_trial_bookings", id);
  await refreshMemberKpis(actor.companyId);
  revalidatePath("/members");
}

/**
 * タブレット受付トークンを発行。生トークンでURLを組み、?intake_url= に載せて一度だけ表示（DECISIONS #12）。
 */
export async function issueTabletToken(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const bookingId = str(formData.get("booking_id"));
  if (!bookingId) return;

  // 既存の未使用トークンを無効化（重複防止）
  await admin
    .from("mbr_intake_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("company_id", actor.companyId)
    .eq("booking_id", bookingId)
    .is("used_at", null);

  const token = generateToken();
  const expires = new Date(Date.now() + INTAKE_TOKEN_TTL_HOURS * 3600 * 1000).toISOString();
  await admin.from("mbr_intake_tokens").insert({
    company_id: actor.companyId,
    booking_id: bookingId,
    token_hash: hashToken(token),
    expires_at: expires,
  });
  await logAudit(actor, "member.intake_token_issue", "mbr_intake_tokens", bookingId);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/intake/${token}`;
  redirect(`/members?intake_url=${encodeURIComponent(url)}&bid=${bookingId}`);
}
