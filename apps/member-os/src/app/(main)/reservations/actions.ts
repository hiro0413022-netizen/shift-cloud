"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";
import { hashToken, generateToken } from "@/lib/intake";
import { slotEnd, HIMEJI_STORE_CODE } from "@/lib/reservation";

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

async function himejiStoreId(companyId: string): Promise<string | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("stores")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", HIMEJI_STORE_CODE)
    .maybeSingle();
  return data?.id ?? null;
}

const KINDS = ["member", "dropin"];
const STATUSES = ["reserved", "visited", "canceled", "no_show"];

/** スタッフによる予約作成（電話/店頭） */
export async function createBooking(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const storeId = await himejiStoreId(actor.companyId);
  if (!storeId) return;

  const resourceId = str(formData.get("resource_id"));
  const date = str(formData.get("booking_date"));
  const start = str(formData.get("start_time"));
  if (!resourceId || !date || !start) return;
  const kind = KINDS.includes(str(formData.get("customer_kind"))) ? str(formData.get("customer_kind")) : "dropin";

  const { error } = await admin.from("res_bookings").insert({
    company_id: actor.companyId,
    store_id: storeId,
    resource_id: resourceId,
    booking_date: date,
    start_time: start,
    end_time: slotEnd(start),
    customer_kind: kind,
    member_no: orNull(formData.get("member_no")),
    guest_name: orNull(formData.get("guest_name")),
    guest_phone: orNull(formData.get("guest_phone")),
    party_size: intOrNull(formData.get("party_size")) ?? 1,
    amount: intOrNull(formData.get("amount")),
    note: orNull(formData.get("note")),
    source: "staff",
    created_by: actor.staffId,
  });
  if (error) {
    // ダブルブッキング等は握りつぶさず再表示（簡易）
    redirect(`/reservations?date=${date}&err=${encodeURIComponent("その枠は既に予約があります")}`);
  }
  await logAudit(actor, "reservation.create", "res_bookings", null, null, { resourceId, date, start });
  revalidatePath("/reservations");
}

export async function setBookingStatus(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !STATUSES.includes(status)) return;
  await admin.from("res_bookings").update({ status }).eq("id", id).eq("company_id", actor.companyId).is("deleted_at", null);
  await logAudit(actor, "reservation.status", "res_bookings", id, null, { status });
  revalidatePath("/reservations");
}

export async function deleteBooking(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin.from("res_bookings").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "reservation.delete", "res_bookings", id);
  revalidatePath("/reservations");
}

/** 公開トークン（お客様Web予約 or 店頭カレンダー）を発行。用途ごとに1つに保つ */
async function issueToken(purpose: "book" | "board", label: string, urlPath: string, urlParam: string) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const storeId = await himejiStoreId(actor.companyId);
  if (!storeId) return;

  await admin.from("res_tokens").update({ active: false })
    .eq("company_id", actor.companyId).eq("store_id", storeId).eq("purpose", purpose).eq("active", true);

  const token = generateToken();
  await admin.from("res_tokens").insert({
    company_id: actor.companyId, store_id: storeId, token_hash: hashToken(token),
    purpose, label, created_by: actor.staffId,
  });
  await logAudit(actor, "reservation.token_issue", "res_tokens", null, null, { purpose });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  redirect(`/reservations?${urlParam}=${encodeURIComponent(`${proto}://${host}/${urlPath}/${token}`)}`);
}

/** お客様Web予約URL（店舗単位・長期有効）を発行 */
export async function issueBookingToken() {
  await issueToken("book", "FRUNK GOLF 姫路 Web予約", "book", "booking_url");
}

/** 店頭常設カレンダーの表示URLを発行（ロビー掲示・タブレット用） */
export async function issueBoardToken() {
  await issueToken("board", "FRUNK GOLF 姫路 店頭カレンダー", "board", "board_url");
}

const PAY_METHOD_VALUES = ["cash", "card", "e_money", "bank", "other"];

/** 入金を記録（全額/一部/免除/取消）。amountは請求額、paid_amountは入金額 */
export async function recordPayment(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const mode = str(formData.get("mode"));
  if (!id) return;

  const billed = intOrNull(formData.get("amount"));
  const methodRaw = str(formData.get("payment_method"));
  const method = PAY_METHOD_VALUES.includes(methodRaw) ? methodRaw : null;

  let patch: Record<string, unknown>;
  if (mode === "waive") {
    patch = { payment_status: "waived", paid_amount: 0, paid_at: new Date().toISOString() };
  } else if (mode === "unpaid") {
    patch = { payment_status: "unpaid", paid_amount: 0, payment_method: null, paid_at: null };
  } else {
    const paid = mode === "full" ? (billed ?? 0) : (intOrNull(formData.get("paid_amount")) ?? 0);
    const status = billed != null && billed > 0 && paid >= billed ? "paid" : paid > 0 ? "partial" : "unpaid";
    patch = {
      paid_amount: paid,
      payment_method: method,
      payment_status: status,
      paid_at: paid > 0 ? new Date().toISOString() : null,
      ...(billed != null ? { amount: billed } : {}),
    };
  }

  await admin.from("res_bookings").update(patch).eq("id", id).eq("company_id", actor.companyId).is("deleted_at", null);
  await logAudit(actor, "reservation.payment", "res_bookings", id, null, { mode, ...patch });
  revalidatePath("/reservations");
}
