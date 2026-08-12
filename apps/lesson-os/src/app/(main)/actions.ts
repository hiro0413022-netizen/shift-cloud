"use server";

import { revalidatePath } from "next/cache";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/** 生徒の追加。WING NOTEと違い名前だけで登録できる（入力の重さをなくす） */
export async function addStudent(formData: FormData): Promise<{ error?: string; id?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "名前を入力してください" };
  const { data, error } = await admin
    .from("lsn_students")
    .insert({
      company_id: actor.companyId,
      // 店舗を必ず刻む（#134）。未設定のまま増やすと、あとから店舗を分けられない行が増え続ける。
      // オーナーは所属が全店なので主店舗（先頭）に寄せる
      store_id: actor.primaryStoreId,
      name: name.slice(0, 100),
      name_kana: String(formData.get("name_kana") ?? "").trim().slice(0, 100) || null,
      member_code: String(formData.get("member_code") ?? "").trim().slice(0, 40) || null,
      goal: String(formData.get("goal") ?? "").trim().slice(0, 300) || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "登録に失敗しました" };
  revalidatePath("/");
  return { id: data.id };
}
