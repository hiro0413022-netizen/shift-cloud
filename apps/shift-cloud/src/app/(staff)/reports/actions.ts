"use server";

import { revalidatePath } from "next/cache";
import { normalizeIncidentCategory, normalizeSeverity } from "@yozan/core/incidents";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { notifySevereIncident } from "@/lib/incident-notify";

export type IncidentInput = {
  category: string;
  severity: string;
  occurredDate: string; // YYYY-MM-DD
  occurredTime: string; // HH:MM
  storeId: string | null;
  place: string;
  involved: string;
  body: string;
  actionTaken: string;
};

/**
 * イレギュラー報告の提出（DECISIONS #125・日報の置き換え）
 *
 * 日報と違い1日1件ではない。「何かあった時に、あった分だけ」書く。
 * 重大度high はその場で責任者へLINE通知する（翌朝のレポートまで待たせない）。
 * 通知の失敗で報告そのものを失わないよう、保存とは分けて握りつぶす。
 */
export async function submitIncident(input: IncidentInput): Promise<{ error?: string; id?: string; notice?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();

  const body = input.body.trim();
  if (!body) return { error: "何があったかを入力してください" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredDate)) return { error: "日付が不正です" };
  if (!/^\d{2}:\d{2}$/.test(input.occurredTime)) return { error: "時刻が不正です" };

  // JSTで入力された日時をそのままJSTとして保存する（サーバーのUTC解釈で9時間ずれるのを防ぐ / [[jst-date-rule]]）
  const occurredAt = `${input.occurredDate}T${input.occurredTime}:00+09:00`;
  const severity = normalizeSeverity(input.severity);
  const storeId = input.storeId && actor.storeIds.includes(input.storeId) ? input.storeId : actor.primaryStoreId;

  const { data, error } = await admin
    .from("sp_incidents")
    .insert({
      company_id: actor.companyId,
      store_id: storeId,
      staff_id: actor.staffId,
      category: normalizeIncidentCategory(input.category),
      severity,
      occurred_at: occurredAt,
      place: input.place.trim().slice(0, 120) || null,
      involved: input.involved.trim().slice(0, 200) || null,
      body: body.slice(0, 4000),
      action_taken: input.actionTaken.trim().slice(0, 2000) || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  let notice: string | undefined;
  if (severity === "high") {
    const r = await notifySevereIncident(String(data.id), actor.companyId);
    notice = r.sent ? "重大として責任者へLINEで通知しました" : `報告は保存しました（LINE通知は未送信: ${r.reason}）`;
  }

  revalidatePath("/reports");
  revalidatePath("/home");
  return { id: String(data.id), notice };
}

/** 対応済みにする / 未対応へ戻す */
export async function toggleIncidentResolved(id: string, note: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: row } = await admin
    .from("sp_incidents")
    .select("id, status")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { error: "報告が見つかりません" };

  const resolve = row.status !== "resolved";
  const { error } = await admin
    .from("sp_incidents")
    .update({
      status: resolve ? "resolved" : "open",
      resolved_at: resolve ? new Date().toISOString() : null,
      resolved_by: resolve ? actor.staffId : null,
      resolution_note: resolve ? note.trim().slice(0, 2000) || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) return { error: error.message };

  revalidatePath("/reports");
  return {};
}
