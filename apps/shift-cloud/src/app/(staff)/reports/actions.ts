"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { todayJST, mondayOf } from "@/lib/util";

/**
 * 日報・週報の提出（upsert / DECISIONS #48）
 * daily=今日の日付、weekly=今週の月曜日をキーに1人1件。再提出は上書き。
 */
export async function submitReport(type: "daily" | "weekly", body: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const text = body.trim();
  if (!text) return { error: "本文を入力してください" };
  const today = todayJST();
  const date = type === "weekly" ? mondayOf(today) : today;

  const { data: existing } = await admin
    .from("sp_reports")
    .select("id")
    .eq("staff_id", actor.staffId)
    .eq("type", type)
    .eq("date", date)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("sp_reports")
      .update({ body: text, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin.from("sp_reports").insert({
      company_id: actor.companyId,
      staff_id: actor.staffId,
      store_id: actor.primaryStoreId,
      type,
      date,
      body: text,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/reports");
  return {};
}
