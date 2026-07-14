"use server";

import { createHash } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { recalcAttendance } from "@/lib/attendance";
import { logAudit } from "@/lib/audit";
import { dateJST } from "@/lib/util";

export async function verifyDevice(token: string) {
  const admin = createAdmin();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: device } = await admin
    .from("kiosk_devices")
    .select("id, company_id, store_id, name, status, stores(name)")
    .eq("token_hash", hash)
    .is("deleted_at", null)
    .maybeSingle();
  if (!device || device.status !== "active") return null;
  return device;
}

export type ClockType = "clock_in" | "clock_out" | "break_start" | "break_end";

export async function recordTime(
  token: string,
  staffId: string,
  type: ClockType
): Promise<{ error?: string; time?: string }> {
  const device = await verifyDevice(token);
  if (!device) return { error: "端末が無効です。管理者に連絡してください。" };

  const admin = createAdmin();
  // スタッフが同じ会社か検証
  const { data: staff } = await admin
    .from("staff")
    .select("id, name")
    .eq("id", staffId)
    .eq("company_id", device.company_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (!staff) return { error: "スタッフが見つかりません" };

  const now = new Date().toISOString();
  const { data: rec, error } = await admin
    .from("time_records")
    .insert({
      company_id: device.company_id,
      staff_id: staffId,
      store_id: device.store_id,
      type,
      recorded_at: now,
      device_id: device.id,
      source: "kiosk",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await recalcAttendance(device.company_id, staffId, dateJST(now));
  await logAudit(null, `time.${type}`, "time_records", rec.id, null, { staffId, device: device.name }, device.company_id);

  return { time: now };
}

/** ⑥ 打刻端末からの伝言・打刻忘れ連絡を保存 */
export async function saveKioskMessage(
  token: string,
  staffId: string | null,
  kind: "missing_clock" | "message",
  body: string
): Promise<{ error?: string; ok?: boolean }> {
  const device = await verifyDevice(token);
  if (!device) return { error: "端末が無効です。管理者に連絡してください。" };
  const text = body.trim();
  if (!text) return { error: "内容を入力してください" };

  const admin = createAdmin();
  const { error } = await admin.from("kiosk_messages").insert({
    company_id: device.company_id,
    store_id: device.store_id,
    staff_id: staffId,
    device_id: device.id,
    kind,
    body: text.slice(0, 1000),
  });
  if (error) return { error: error.message };
  await logAudit(null, "kiosk.message", "kiosk_messages", null, null, { staffId, kind }, device.company_id);
  return { ok: true };
}

/** キオスク表示用: 店舗スタッフと今日の打刻状態 */
export async function getKioskState(token: string) {
  const device = await verifyDevice(token);
  if (!device) return null;
  const admin = createAdmin();
  const today = dateJST(new Date().toISOString());

  const [{ data: staffRows }, { data: records }] = await Promise.all([
    admin.from("staff")
      .select("id, name, staff_store_assignments!inner(store_id)")
      .eq("company_id", device.company_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("staff_store_assignments.store_id", device.store_id)
      .order("name"),
    admin.from("time_records")
      .select("staff_id, type, recorded_at")
      .eq("store_id", device.store_id)
      .gte("recorded_at", `${today}T00:00:00+09:00`)
      .order("recorded_at"),
  ]);

  const lastByStaff = new Map<string, string>();
  for (const r of records ?? []) lastByStaff.set(r.staff_id, r.type);

  return {
    storeName: (device.stores as unknown as { name: string } | null)?.name ?? "",
    staff: (staffRows ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      last: lastByStaff.get(s.id) ?? null,
    })),
  };
}
