"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { getActor, isOwner, assertStoreAccess } from "@/lib/auth";
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

/**
 * 書込み先の店舗チェック（#134・#128 店舗またぎ廃止）。
 * 触ってよいのは「認証で解決した店舗」だけ。以前は同一会社かどうかしか見ておらず、
 * 引数（クライアント渡し）を差し替えれば他店のタスクを作れた／他店のタスクを消化できた。
 * 例外は、オーナー（manage_company）がスタッフとしてもログインして店舗を切り替えている場合のみ。
 */
async function canWriteStore(ctx: { companyId: string; storeId: string }, storeId: string | null): Promise<boolean> {
  if (!storeId) return false;
  if (storeId === ctx.storeId) return true;
  const actor = await getActor();
  if (!actor || actor.companyId !== ctx.companyId || !isOwner(actor)) return false;
  return assertStoreAccess(actor, storeId).then(() => true).catch(() => false);
}

export async function toggleStoreTask(token: string | null, taskId: string): Promise<{ error?: string }> {
  const ctx = await resolveCtx(token);
  if (!ctx) return { error: "認証が無効です" };
  const admin = createAdmin();

  const { data: task } = await admin
    .from("sp_tasks")
    .select("id, status, company_id, store_id, staff_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task || task.company_id !== ctx.companyId || task.staff_id !== null) {
    return { error: "タスクが見つかりません" };
  }
  // 他店のタスクは消化できない（#134）
  if (!(await canWriteStore(ctx, task.store_id))) return { error: "タスクが見つかりません" };

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

  // 書込み先は「認証で解決した店舗」だけ（#134）
  if (!(await canWriteStore(ctx, storeId))) return { error: "店舗が不正です" };

  const admin = createAdmin();
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
