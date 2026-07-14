"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** ログインID→擬似メール変換（DECISIONS #2、Shift Cloud/Member OSと共通仕様） */
function loginIdToEmail(loginId: string) {
  return `${loginId.toLowerCase()}@staff.yozan.internal`;
}

export async function login(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const id = String(formData.get("id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!id || !password) return { error: "IDとパスワードを入力してください" };

  const email = id.includes("@") ? id : loginIdToEmail(id);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "IDまたはパスワードが正しくありません" };
  redirect("/");
}
