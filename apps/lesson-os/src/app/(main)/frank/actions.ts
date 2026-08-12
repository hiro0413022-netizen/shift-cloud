"use server";

import { revalidatePath } from "next/cache";
import { requireFrankActor, FRANK_STORE_ID as FRANK_STORE } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * FRANK レッスン管理（#88 §3-4）
 * 枠の公開・クローズ、レッスン記録＋申し送りの保存。
 * 実行できるのは FRANK 配属のスタッフとオーナーだけ（#134 / DECISIONS #128）。
 * 画面を隠すだけでは Server Action を直接叩けるため、各アクションで確認する。
 */

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 枠の一括公開: コーチ×日付×開始〜終了をレッスン時間で分割して作成 */
export async function createSlots(formData: FormData): Promise<{ error?: string; created?: number }> {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const coachId = String(formData.get("coach_staff_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const minutes = Number(formData.get("minutes") ?? 60);
  const bayId = String(formData.get("bay_id") ?? "") || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;
  if (!coachId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end))
    return { error: "コーチ・日付・時間を入力してください" };
  if (![30, 60, 90].includes(minutes)) return { error: "レッスン時間が不正です" };
  if (toMin(end) <= toMin(start)) return { error: "終了時刻は開始より後にしてください" };

  const rows = [];
  for (let m = toMin(start); m + minutes <= toMin(end); m += minutes) {
    rows.push({
      company_id: actor.companyId,
      store_id: FRANK_STORE,
      coach_staff_id: coachId,
      bay_id: bayId,
      slot_date: date,
      start_time: toTime(m),
      end_time: toTime(m + minutes),
      status: "open",
      note,
    });
  }
  if (!rows.length) return { error: "作成できる枠がありません（時間帯を確認してください）" };
  // 既存枠と重なる開始時刻は unique index に任せて1件ずつ入れる（重複はスキップ）
  let created = 0;
  for (const r of rows) {
    const { error } = await admin.from("frunk_lesson_slots").insert(r);
    if (!error) created += 1;
  }
  revalidatePath("/frank");
  return { created };
}

/** 枠のクローズ/再公開/削除（予約が入っている枠は削除不可） */
export async function setSlotStatus(formData: FormData): Promise<{ error?: string }> {
  await requireFrankActor();
  const admin = createAdmin();
  const slotId = String(formData.get("slot_id") ?? "");
  const op = String(formData.get("op") ?? ""); // 'close' | 'open' | 'delete'
  if (!slotId || !["close", "open", "delete"].includes(op)) return { error: "不正な操作です" };
  const { data: booked } = await admin
    .from("frunk_lesson_bookings")
    .select("id")
    .eq("slot_id", slotId)
    .in("status", ["confirmed", "done"])
    .is("deleted_at", null)
    .limit(1);
  if (op === "delete") {
    if (booked?.length) return { error: "予約が入っている枠は削除できません（先にキャンセルしてください）" };
    await admin.from("frunk_lesson_slots").update({ deleted_at: new Date().toISOString() }).eq("id", slotId);
  } else {
    await admin
      .from("frunk_lesson_slots")
      .update({ status: op === "close" ? "closed" : "open", updated_at: new Date().toISOString() })
      .eq("id", slotId);
  }
  revalidatePath("/frank");
  return {};
}

/** スタッフによる予約キャンセル（会員都合の電話連絡など） */
export async function cancelLessonByStaff(formData: FormData): Promise<{ error?: string }> {
  await requireFrankActor();
  const admin = createAdmin();
  const bookingId = String(formData.get("booking_id") ?? "");
  if (!bookingId) return { error: "不正な操作です" };
  await admin
    .from("frunk_lesson_bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "confirmed");
  revalidatePath("/frank");
  return {};
}

/** レッスン記録＋次回への申し送りを保存（保存で実施済み=done） */
export async function saveLessonRecord(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const bookingId = String(formData.get("booking_id") ?? "");
  const record = String(formData.get("record_note") ?? "").trim().slice(0, 2000);
  const handover = String(formData.get("handover_note") ?? "").trim().slice(0, 1000);
  if (!bookingId) return { error: "不正な操作です" };
  if (!record && !handover) return { error: "記録または申し送りを入力してください" };
  const { error } = await admin
    .from("frunk_lesson_bookings")
    .update({
      record_note: record || null,
      handover_note: handover || null,
      status: "done",
      recorded_by: actor.staffId,
      recorded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .in("status", ["confirmed", "done"]);
  if (error) return { error: "保存に失敗しました" };
  revalidatePath("/frank");
  return {};
}
