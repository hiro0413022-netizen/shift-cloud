"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@/lib/supabase/admin";
import { verifyStoreDevice } from "@/lib/store-dash";

/**
 * 店舗ダッシュボードのタスク操作。
 * 認証はデバイストークン（kiosk_devices）。操作対象は店舗共通タスク（staff_id null）のみ。
 */

export async function toggleStoreTask(token: string, taskId: string): Promise<{ error?: string }> {
  const device = await verifyStoreDevice(token);
  if (!device) return { error: "端末が無効です" };
  const admin = createAdmin();

  const { data: task } = await admin
    .from("sp_tasks")
    .select("id, status, company_id, staff_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task || task.company_id !== device.companyId || task.staff_id !== null) {
    return { error: "タスクが見つかりません" };
  }

  const { error } = await admin
    .from("sp_tasks")
    .update({ status: task.status === "done" ? "open" : "done", updated_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) return { error: error.message };
  revalidatePath(`/store/${token}`);
  return {};
}

export async function addStoreTask(
  token: string,
  storeId: string,
  date: string,
  title: string
): Promise<{ error?: string }> {
  const device = await verifyStoreDevice(token);
  if (!device) return { error: "端末が無効です" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日付が不正です" };
  const text = title.trim();
  if (!text) return { error: "内容を入力してください" };
  if (text.length > 200) return { error: "200文字以内で入力してください" };

  const admin = createAdmin();
  // storeId が同一会社の店舗か検証（別テナントへの書込み防止）
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .eq("company_id", device.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!store) return { error: "店舗が不正です" };

  const { error } = await admin.from("sp_tasks").insert({
    company_id: device.companyId,
    staff_id: null, // 店舗共通タスク（DECISIONS #55）
    store_id: storeId,
    date,
    title: text,
    source: "manual",
  });
  if (error) return { error: error.message };
  revalidatePath(`/store/${token}`);
  return {};
}
