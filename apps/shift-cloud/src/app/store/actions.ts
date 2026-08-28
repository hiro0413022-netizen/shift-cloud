"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { getActor, isOwner, assertStoreAccess } from "@/lib/auth";
import { verifyStoreDevice } from "@/lib/store-dash";
import { getStoreSession, clearStoreSession } from "@/lib/store-session";
import { logAudit } from "@/lib/audit";

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

/**
 * シフト表のスタッフ行を並べ替える（#171）。
 * 保存先は staff.sort_order＝スタッフ管理の▲▼・紙シフト・シフト作成と同じ正典（#147）なので、
 * ここで並べ替えると全画面の行順が揃う。
 *
 * 画面に出ているのは「その月にシフトがある人」だけなので、会社全体の並びの中で
 * **その人たちが占めている位置だけ**を入れ替える（表示していないスタッフの位置は動かさない）。
 */
export async function reorderStoreStaff(
  token: string | null,
  storeId: string,
  orderedStaffIds: string[]
): Promise<{ error?: string }> {
  const ctx = await resolveCtx(token);
  if (!ctx) return { error: "認証が無効です" };
  // 書込み先は「認証で解決した店舗」だけ（#134）
  if (!(await canWriteStore(ctx, storeId))) return { error: "店舗が不正です" };

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = orderedStaffIds.filter((v, i, a) => typeof v === "string" && uuid.test(v) && a.indexOf(v) === i);
  if (ids.length !== orderedStaffIds.length) return { error: "スタッフが不正です" };
  if (ids.length < 2) return {};

  const admin = createAdmin();

  // 並べ替えてよいのは「その画面に出ている人」＝この店舗にシフトがあるスタッフだけ。
  // idはクライアント渡しなので、差し替えて他店・他社のスタッフを動かせないようサーバーで確かめる（#134）
  const { data: owned } = await admin
    .from("shifts")
    .select("staff_id")
    .eq("company_id", ctx.companyId)
    .eq("store_id", storeId)
    .in("staff_id", ids)
    .is("deleted_at", null)
    .limit(2000);
  const allowed = new Set(((owned ?? []) as { staff_id: string | null }[]).map((r) => r.staff_id));
  if (ids.some((id) => !allowed.has(id))) return { error: "スタッフが不正です" };

  // 会社全体の現在の並び（sort_order → 氏名。画面と同じ規則）
  const { data: rows } = await admin
    .from("staff")
    .select("id, sort_order, name")
    .eq("company_id", ctx.companyId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");
  const list = (rows ?? []) as Array<{ id: string; sort_order: number | null; name: string }>;
  const slots: number[] = [];
  list.forEach((r, i) => { if (ids.includes(r.id)) slots.push(i); });
  if (slots.length !== ids.length) return { error: "スタッフが不正です" };

  const next = list.map((r) => r.id);
  slots.forEach((slot, k) => { next[slot] = ids[k]; });

  // 全員0（初期値）のままだと並べても効かないので、いまの並びで 10,20,30… に振り直す。
  // 実際に値が変わる行だけ書く
  const current = new Map(list.map((r) => [r.id, r.sort_order ?? 0]));
  for (let i = 0; i < next.length; i += 1) {
    const want = (i + 1) * 10;
    if (current.get(next[i]) === want) continue;
    const { error } = await admin.from("staff").update({ sort_order: want }).eq("id", next[i]);
    if (error) return { error: error.message };
  }

  // 店頭の共有端末（スタッフログインとは限らない）からの操作なので actor は null で記録する
  const actor = await getActor();
  await logAudit(
    actor && actor.companyId === ctx.companyId ? actor : null,
    "staff.reorder",
    "staff",
    null,
    { order: list.map((r) => r.id) },
    { order: next, via: "store-dashboard", store_id: storeId },
    ctx.companyId
  );

  revalidate(token);
  revalidatePath("/admin/staff");
  revalidatePath("/admin/shifts");
  return {};
}

/** 店舗ログイン（Cookie方式）からのログアウト */
export async function logoutStore(): Promise<void> {
  await clearStoreSession();
  redirect("/login");
}
