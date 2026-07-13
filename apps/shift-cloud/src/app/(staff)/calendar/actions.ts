"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/** カレンダーメモの保存（upsert）。空文字は削除扱い（論理削除） */
export async function saveMemo(date: string, memo: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日付が不正です" };
  const text = memo.trim();

  const { data: existing } = await admin
    .from("sp_calendar_memos")
    .select("id")
    .eq("staff_id", actor.staffId)
    .eq("date", date)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("sp_calendar_memos")
      .update(text ? { memo: text, updated_at: new Date().toISOString() } : { deleted_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else if (text) {
    const { error } = await admin.from("sp_calendar_memos").insert({
      company_id: actor.companyId,
      staff_id: actor.staffId,
      date,
      memo: text,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/calendar");
  return {};
}

/** タスクの完了/未完了切替（本人のタスクのみ） */
export async function toggleTask(taskId: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data: task } = await admin
    .from("sp_tasks")
    .select("id, status, staff_id")
    .eq("id", taskId)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task || task.staff_id !== actor.staffId) return { error: "タスクが見つかりません" };
  const { error } = await admin
    .from("sp_tasks")
    .update({ status: task.status === "done" ? "open" : "done", updated_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  revalidatePath("/home");
  return {};
}

/** 自分のタスクを追加（date=実施日） */
export async function addTask(date: string, title: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日付が不正です" };
  const t = title.trim();
  if (!t) return { error: "タイトルを入力してください" };
  const { error } = await admin.from("sp_tasks").insert({
    company_id: actor.companyId,
    staff_id: actor.staffId,
    store_id: actor.primaryStoreId,
    date,
    title: t.slice(0, 200),
    source: "manual",
    created_by: actor.staffId,
  });
  if (error) return { error: error.message };
  revalidatePath("/calendar");
  revalidatePath("/home");
  return {};
}
