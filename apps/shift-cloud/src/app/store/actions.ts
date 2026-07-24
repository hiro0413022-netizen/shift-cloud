"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { verifyStoreDevice } from "@/lib/store-dash";
import { getStoreSession, clearStoreSession } from "@/lib/store-session";

/**
 * 店舗ダッシュボードのタスク操作。
 * 認証は「デバイストークン（/store/[token]）」または「店舗ログインCookie（/store）」のどちらか。
 * 操作対象は店舗共通タスク（staff_id null）のみ。
 */

async function resolveCtx(token: string | null): Promise<{ companyId: string; storeId: string } | null> {
  if (token) {
    const d = await verifyStoreDevice(token);
    return d ? { companyId: d.companyId, storeId: d.storeId } : null;
  }
  const s = await getStoreSession();
  return s ? { companyId: s.companyId, storeId: s.storeId } : null;
}

function revalidate(token: string | null) {
  revalidatePath(token ? `/store/${token}` : "/store");
}

export async function toggleStoreTask(token: string | null, taskId: string): Promise<{ error?: string }> {
  const ctx = await resolveCtx(token);
  if (!ctx) return { error: "認証が無効です" };
  const admin = createAdmin();

  const { data: task } = await admin
    .from("sp_tasks")
    .select("id, status, company_id, staff_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task || task.company_id !== ctx.companyId || task.staff_id !== null) {
    return { error: "タスクが見つかりません" };
  }

  const { error } = await admin
    .from("sp_tasks")
    .update({ status: task.status === "done" ? "open" : "done", updated_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) return { error: error.message };
  revalidate(token);
  return {};
}

export async function addStoreTask(
  token: string | null,
  storeId: string,
  date: string,
  title: string
): Promise<{ error?: string }> {
  const ctx = await resolveCtx(token);
  if (!ctx) return { error: "認証が無効です" };
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
    .eq("company_id", ctx.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!store) return { error: "店舗が不正です" };

  const { error } = await admin.from("sp_tasks").insert({
    company_id: ctx.companyId,
    staff_id: null, // 店舗共通タスク（DECISIONS #55）
    store_id: storeId,
    date,
    title: text,
    source: "manual",
  });
  if (error) return { error: error.message };
  revalidate(token);
  return {};
}

/** 店舗ログイン（Cookie方式）からのログアウト */
export async function logoutStore(): Promise<void> {
  await clearStoreSession();
  redirect("/login");
}
