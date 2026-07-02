"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { recalcAttendance } from "@/lib/attendance";
import { logAudit } from "@/lib/audit";

/**
 * 打刻修正: 元打刻は書き換えず、修正レコードを積む（DECISIONS #6）
 * clock_in / clock_out をそれぞれ HH:MM で指定（空なら変更なし）
 */
export async function correctAttendance(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireActor("edit_attendance");
  const admin = createAdmin();

  const staffId = String(formData.get("staff_id"));
  const storeId = String(formData.get("store_id"));
  const date = String(formData.get("date"));
  const newIn = String(formData.get("clock_in") || "");
  const newOut = String(formData.get("clock_out") || "");
  const reason = String(formData.get("reason") || "").trim();

  if (!reason) return { error: "修正理由は必須です" };
  if (!newIn && !newOut) return { error: "修正する時刻を入力してください" };

  // 有効な既存打刻を取得
  const { data: records } = await admin
    .from("time_records")
    .select("id, type, correction_of")
    .eq("staff_id", staffId)
    .gte("recorded_at", `${date}T00:00:00+09:00`)
    .lte("recorded_at", `${date}T23:59:59+09:00`)
    .order("recorded_at");
  const superseded = new Set((records ?? []).map((r) => r.correction_of).filter(Boolean));
  const effective = (records ?? []).filter((r) => !superseded.has(r.id));

  async function correct(type: "clock_in" | "clock_out", hhmm: string) {
    const target = type === "clock_in"
      ? effective.find((r) => r.type === "clock_in")
      : [...effective].reverse().find((r) => r.type === "clock_out");
    const { data: rec, error } = await admin
      .from("time_records")
      .insert({
        company_id: actor.companyId,
        staff_id: staffId,
        store_id: storeId,
        type,
        recorded_at: `${date}T${hhmm}:00+09:00`,
        source: "admin",
        correction_of: target?.id ?? null,
        correction_reason: reason,
        corrected_by: actor.staffId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(actor, "attendance.correct", "time_records", rec.id, target ?? null, { type, date, hhmm, reason });
  }

  try {
    if (newIn) await correct("clock_in", newIn);
    if (newOut) await correct("clock_out", newOut);
  } catch (e) {
    return { error: (e as Error).message };
  }

  await recalcAttendance(actor.companyId, staffId, date);
  revalidatePath("/admin/attendance");
  return {};
}
