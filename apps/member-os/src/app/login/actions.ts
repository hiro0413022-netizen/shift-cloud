"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** ログインID→擬似メール変換（DECISIONS #2、Shift Cloudと共通仕様） */
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
  // 店舗で最初に見たいのは予約カレンダー（#129）。/dashboard が店舗ごとに出し分ける
  // （FRANK姫路=カレンダー / GOLF WING宝塚=月次KPI）
  redirect("/dashboard");
}
