"use server";

import { redirect } from "next/navigation";
import { requireReserveActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent, logAudit } from "@/lib/kernel";
import { jstLocalToISO, fmtJst } from "@/lib/reserve";
import { sendConfirmation } from "@/lib/mail";
import { closeStaffTask } from "@/lib/staff-task";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

async function loadOwned(id: string, companyId: string) {
  const admin = createAdmin();
  const { data } = await admin
    .from("res_requests")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

/** 確定：希望日時(第1〜3 or 手動指定)を確定し、任意で確定メールを送信 */
export async function confirmRequest(formData: FormData) {
  const actor = await requireReserveActor();
  const id = str(formData.get("id"));
  const slot = str(formData.get("slot")); // "1" | "2" | "3" | "custom"
  const customAt = jstLocalToISO(str(formData.get("custom_at")));
  const message = str(formData.get("message"));
  const staffNote = str(formData.get("staff_note"));
  const sendMail = str(formData.get("send_email")) === "1";
  if (!id) redirect("/");

  const req = await loadOwned(id, actor.companyId);
  if (!req) redirect("/");

  let confirmedISO: string | null = null;
  let confirmedSlot: number | null = null;
  if (slot === "1") confirmedISO = req.pref1_at as string;
  else if (slot === "2") confirmedISO = req.pref2_at as string;
  else if (slot === "3") confirmedISO = req.pref3_at as string;
  else if (slot === "custom") confirmedISO = customAt;
  if (slot === "1" || slot === "2" || slot === "3") confirmedSlot = parseInt(slot, 10);
  if (!confirmedISO) redirect(`/requests/${id}?err=slot`);

  const admin = createAdmin();
  await admin
    .from("res_requests")
    .update({
      status: "confirmed",
      confirmed_at: confirmedISO,
      confirmed_slot: confirmedSlot,
      staff_note: staffNote || (req.staff_note as string) || null,
      handled_by: actor.staffId,
    })
    .eq("id", id);

  if (sendMail) {
    const res = await sendConfirmation({ ...req }, confirmedISO, message).catch((e) => { console.error(e); return { ok: false }; });
    if (res.ok) await admin.from("res_requests").update({ ack_sent_at: new Date().toISOString() }).eq("id", id);
  }

  // スタッフポータルの「やること」を完了にする（DECISIONS #55）
  await closeStaffTask(id, actor.staffId);

  await logAudit(actor, "reserve.confirm", "res_requests", id, { status: req.status }, { status: "confirmed", confirmed_at: confirmedISO });
  await logEvent(actor.companyId, {
    event_type: "reserve.confirmed",
    title: `予約確定: ${String(req.name)} 様 / ${fmtJst(confirmedISO)}`,
    source: "human", source_type: "human", severity: "info", status: "confirmed",
  });
  redirect(`/requests/${id}`);
}

/** 見送り（日程不成立など） */
export async function declineRequest(formData: FormData) {
  const actor = await requireReserveActor();
  const id = str(formData.get("id"));
  const staffNote = str(formData.get("staff_note"));
  if (!id) redirect("/");
  const req = await loadOwned(id, actor.companyId);
  if (!req) redirect("/");

  const admin = createAdmin();
  await admin.from("res_requests").update({ status: "declined", staff_note: staffNote || null, handled_by: actor.staffId }).eq("id", id);
  await closeStaffTask(id, actor.staffId);
  await logAudit(actor, "reserve.decline", "res_requests", id, { status: req.status }, { status: "declined" });
  redirect(`/requests/${id}`);
}

/** 来店完了 */
export async function completeRequest(formData: FormData) {
  const actor = await requireReserveActor();
  const id = str(formData.get("id"));
  if (!id) redirect("/");
  const req = await loadOwned(id, actor.companyId);
  if (!req) redirect("/");
  const admin = createAdmin();
  await admin.from("res_requests").update({ status: "completed", handled_by: actor.staffId }).eq("id", id);
  await closeStaffTask(id, actor.staffId);
  await logAudit(actor, "reserve.complete", "res_requests", id, { status: req.status }, { status: "completed" });
  redirect(`/requests/${id}`);
}

/** キャンセル */
export async function cancelRequest(formData: FormData) {
  const actor = await requireReserveActor();
  const id = str(formData.get("id"));
  if (!id) redirect("/");
  const req = await loadOwned(id, actor.companyId);
  if (!req) redirect("/");
  const admin = createAdmin();
  await admin.from("res_requests").update({ status: "canceled", handled_by: actor.staffId }).eq("id", id);
  await closeStaffTask(id, actor.staffId);
  await logAudit(actor, "reserve.cancel", "res_requests", id, { status: req.status }, { status: "canceled" });
  redirect(`/requests/${id}`);
}

/** 社内メモの保存 */
export async function saveNote(formData: FormData) {
  const actor = await requireReserveActor();
  const id = str(formData.get("id"));
  const staffNote = str(formData.get("staff_note"));
  if (!id) redirect("/");
  const req = await loadOwned(id, actor.companyId);
  if (!req) redirect("/");
  const admin = createAdmin();
  await admin.from("res_requests").update({ staff_note: staffNote || null }).eq("id", id);
  redirect(`/requests/${id}`);
}
