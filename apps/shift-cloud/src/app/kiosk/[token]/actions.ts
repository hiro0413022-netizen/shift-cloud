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

/**
 * 本部（stores.kind='hq'）に所属する人の本部ID。本部には打刻端末が無いので、
 * 本部の人は会社のどの店舗の端末でも打刻でき、打刻は本部の勤怠として残す（#253）。
 * その端末の店舗にも所属している人は、従来どおりその店舗の打刻にする。
 */
async function hqStoreFor(
  admin: ReturnType<typeof createAdmin>,
  companyId: string,
  staffId: string,
  deviceStoreId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("staff_store_assignments")
    .select("store_id, stores!inner(kind)")
    .eq("staff_id", staffId)
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const rows = (data ?? []) as unknown as Array<{ store_id: string; stores: { kind: string } | null }>;
  if (rows.some((r) => r.store_id === deviceStoreId)) return null;
  return rows.find((r) => r.stores?.kind === "hq")?.store_id ?? null;
}

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

  // 本部の人は本部の打刻として記録する（#253）
  const hqStoreId = await hqStoreFor(admin, device.company_id, staffId, device.store_id);

  const now = new Date().toISOString();
  const { data: rec, error } = await admin
    .from("time_records")
    .insert({
      company_id: device.company_id,
      staff_id: staffId,
      store_id: hqStoreId ?? device.store_id,
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

  // この店舗の人 ＋ 本部の人（本部には端末が無いので、どの店舗の端末でも打刻できる・#253）
  const { data: hq } = await admin
    .from("stores").select("id")
    .eq("company_id", device.company_id).eq("kind", "hq").is("deleted_at", null);
  const storeIds = [device.store_id, ...((hq ?? []) as Array<{ id: string }>).map((h) => h.id)];

  const { data: staffRaw } = await admin.from("staff")
    .select("id, name, staff_store_assignments!inner(store_id, deleted_at)")
    .eq("company_id", device.company_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("staff_store_assignments.store_id", storeIds)
    .is("staff_store_assignments.deleted_at", null)
    .order("name");
  const seen = new Set<string>();
  const staffRows = ((staffRaw ?? []) as Array<{ id: string; name: string }>).filter((s) =>
    seen.has(s.id) ? false : (seen.add(s.id), true),
  );

  // 今日の打刻は「表示する人」で引く（本部の人の打刻は本部の店舗IDで入っているため）
  const { data: records } = staffRows.length
    ? await admin.from("time_records")
        .select("staff_id, type, recorded_at")
        .eq("company_id", device.company_id)
        .in("staff_id", staffRows.map((s) => s.id))
        .gte("recorded_at", `${today}T00:00:00+09:00`)
        .order("recorded_at")
    : { data: [] as Array<{ staff_id: string; type: string; recorded_at: string }> };

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
