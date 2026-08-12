"use server";

import { revalidatePath } from "next/cache";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";
import { FRANK_STORE_ID, toMin, toTime } from "@/lib/frank-reservation";
import { requireStoreAccess } from "@/lib/store-scope";
import { loadBookingCfg, businessHours } from "@yozan/core/frank-booking";

/**
 * FRANK GOLF 予約管理（スタッフ操作）— 台帳は frunk_bookings 一本（#93 / 0084）
 *
 * 旧 res_bookings は廃止した。お客様の予約は frankgolf.jp のサイトで完結し、
 * ここはスタッフが「電話・店頭で受けた予約の登録」「来店確認」「入金」を行う画面。
 */

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: FormDataEntryValue | null): number | null {
  const s = str(v).replace(/[^\d-]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function back(date: string) {
  revalidatePath("/reservations");
  if (date) revalidatePath(`/reservations?date=${date}`);
  revalidatePath("/trials");
}

/** 電話・店頭で受けた予約を作る（会員 / 都度利用） */
export async function createBooking(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // FRANK姫路の予約はFRANKに配属された人だけ（#134）
  const admin = createAdmin();

  const date = str(formData.get("booking_date"));
  const start = str(formData.get("start_time"));
  const bayId = str(formData.get("bay_id"));
  const kind = str(formData.get("customer_kind")) || "dropin";
  const minutes = num(formData.get("minutes")) ?? 60;
  const memberNo = str(formData.get("member_no"));
  const guestName = str(formData.get("guest_name"));

  if (!date || !start || !bayId) return;

  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(date, cfg);
  if (!hours) return back(date);

  const s = toMin(start);
  const e = s + minutes;
  if (s < toMin(hours.open) || e > toMin(hours.close)) return back(date);

  // 会員指定なら会員を引く（見つからなければ名前だけの都度予約として登録）
  let memberId: string | null = null;
  if (kind === "member" && memberNo) {
    const { data: m } = await admin
      .from("frunk_members")
      .select("id")
      .eq("company_id", actor.companyId)
      .eq("store_id", FRANK_STORE_ID)
      .eq("member_no", memberNo)
      .is("deleted_at", null)
      .maybeSingle();
    memberId = m?.id ? String(m.id) : null;
  }
  if (!memberId && !guestName) return back(date); // 持ち主が分からない予約は作らない

  // 区間の重なりを確認（DBのunique indexは開始時刻だけを見るため）
  const { data: same } = await admin
    .from("frunk_bookings")
    .select("start_time, end_time")
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .eq("bay_id", bayId)
    .eq("booked_date", date)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  for (const b of same ?? []) {
    if (s < toMin(String(b.end_time)) && e > toMin(String(b.start_time))) return back(date);
  }

  const { error } = await admin.from("frunk_bookings").insert({
    company_id: actor.companyId,
    store_id: FRANK_STORE_ID,
    member_id: memberId,
    customer_kind: memberId ? "member" : "dropin",
    guest_name: memberId ? null : guestName,
    guest_phone: str(formData.get("guest_phone")) || null,
    party_size: num(formData.get("party_size")) ?? 1,
    bay_id: bayId,
    booked_date: date,
    start_time: start,
    end_time: toTime(e),
    status: "confirmed",
    source: "staff",
    amount: num(formData.get("amount")),
    note: str(formData.get("note")) || null,
  });
  if (!error) await logAudit(actor, "frank.booking.create", "frunk_bookings", null, null, { date, start, bayId });
  back(date);
}

/** 来店 / 無断欠 / 取消 */
export async function setBookingStatus(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // #134
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  const date = str(formData.get("date"));
  if (!id || !["confirmed", "visited", "no_show", "cancelled"].includes(status)) return;

  const { data: bk } = await admin
    .from("frunk_bookings")
    .select("id, trial_request_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .maybeSingle();
  if (!bk) return;

  await admin.from("frunk_bookings").update({ status, updated_at: new Date().toISOString() }).eq("id", id);

  // 体験は申込側のステータスも合わせる（2画面で食い違わないように）
  if (bk.trial_request_id) {
    const trialStatus = status === "cancelled" ? "canceled" : status === "visited" ? "done" : "confirmed";
    await admin
      .from("mbr_trial_requests")
      .update({ status: trialStatus, reviewed_by: actor.staffId, reviewed_at: new Date().toISOString() })
      .eq("id", bk.trial_request_id);
  }

  await logAudit(actor, "frank.booking.status", "frunk_bookings", id, null, { status });
  back(date);
}

/** 予約を消す（誤入力の取り消し） */
export async function deleteBooking(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // #134
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const date = str(formData.get("date"));
  if (!id) return;

  const { data: bk } = await admin
    .from("frunk_bookings")
    .select("id, trial_request_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .maybeSingle();
  if (!bk) return;

  const now = new Date().toISOString();
  await admin.from("frunk_bookings").update({ deleted_at: now }).eq("id", id);
  if (bk.trial_request_id) {
    await admin.from("mbr_trial_requests").update({ deleted_at: now }).eq("id", bk.trial_request_id);
  }
  await logAudit(actor, "frank.booking.delete", "frunk_bookings", id, null, null);
  back(date);
}

/** 入金の記録（記録 / 全額入金 / 免除） */
export async function recordPayment(formData: FormData) {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID); // #134
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const mode = str(formData.get("mode"));
  const date = str(formData.get("date"));
  if (!id) return;

  const amount = num(formData.get("amount"));
  const method = str(formData.get("payment_method")) || null;
  const now = new Date().toISOString();

  let patch: Record<string, unknown>;
  if (mode === "waive") {
    patch = { payment_status: "waived", payment_method: method, paid_at: now };
  } else if (mode === "full") {
    patch = { amount, paid_amount: amount ?? 0, payment_status: "paid", payment_method: method, paid_at: now };
  } else {
    const paid = num(formData.get("paid_amount")) ?? 0;
    const status = amount == null ? "unpaid" : paid <= 0 ? "unpaid" : paid >= amount ? "paid" : "partial";
    patch = { amount, paid_amount: paid, payment_status: status, payment_method: method, paid_at: paid > 0 ? now : null };
  }

  await admin.from("frunk_bookings").update({ ...patch, updated_at: now })
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID);
  await logAudit(actor, "frank.booking.payment", "frunk_bookings", id, null, patch);
  back(date);
}

/* 店頭カレンダーのトークンURL発行は廃止した。
 * 店頭では店舗アカウントでログインして `/board` を開く（ログイン必須）。
 * お客様Web予約のトークンURLも廃止済み（#93・予約はサイトに集約）。 */
