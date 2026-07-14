"use server";

import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { logEvent } from "@/lib/kernel";
import { slotEnd } from "@/lib/reservation";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

/** お客様Web予約の送信（店舗トークン検証・service_role経由・予約不要の公開ルート） */
export async function bookPublic(formData: FormData) {
  const token = str(formData.get("token"));
  const date = str(formData.get("date"));
  const slot = str(formData.get("slot")); // "resourceId|HH:MM"
  const name = str(formData.get("guest_name"));
  const back = `/book/${token}?date=${date}`;
  if (!token) return;
  if (!slot || !date) redirect(`${back}&err=${encodeURIComponent("時間枠を選択してください")}`);
  if (!name) redirect(`${back}&err=${encodeURIComponent("お名前を入力してください")}`);

  const admin = createAdmin();
  const { data: tok } = await admin
    .from("res_tokens").select("company_id, store_id, active")
    .eq("token_hash", hashToken(token)).maybeSingle();
  if (!tok || !tok.active) redirect(`${back}&err=${encodeURIComponent("無効な予約URLです")}`);

  const [resourceId, start] = slot.split("|");
  if (!resourceId || !start) redirect(`${back}&err=${encodeURIComponent("時間枠が不正です")}`);

  const memberNo = orNull(formData.get("member_no"));
  const { error } = await admin.from("res_bookings").insert({
    company_id: tok!.company_id,
    store_id: tok!.store_id,
    resource_id: resourceId,
    booking_date: date,
    start_time: start,
    end_time: slotEnd(start),
    customer_kind: memberNo ? "member" : "dropin",
    member_no: memberNo,
    guest_name: name,
    guest_phone: orNull(formData.get("guest_phone")),
    guest_email: orNull(formData.get("guest_email")),
    party_size: parseInt(str(formData.get("party_size")) || "1", 10) || 1,
    source: "web",
    status: "reserved",
  });
  if (error) {
    redirect(`${back}&err=${encodeURIComponent("その枠は満席になりました。別の時間をお選びください")}`);
  }

  await logEvent(tok!.company_id as string, {
    event_type: "reservation.web_booked",
    title: `Web予約: ${name} 様 / ${date} ${start}`,
    source: "web", source_type: "external", severity: "info",
  });
  redirect(`/book/${token}?booked=1`);
}
