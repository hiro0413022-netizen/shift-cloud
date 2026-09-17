"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginIdToEmail } from "@/lib/auth";
import { storeLoginExists, verifyStoreLogin, setStoreSession } from "@/lib/store-session";

export async function login(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get("id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!id || !password) return { error: "IDとパスワードを入力してください" };

  // 店舗用ID（店舗ダッシュボード）を優先照合。@付き（メール）はスタッフ確定なのでスキップ。
  if (!id.includes("@") && (await storeLoginExists(id))) {
    const session = await verifyStoreLogin(id, password);
    if (!session) return { error: "IDまたはパスワードが正しくありません" };
    await setStoreSession(session.loginRowId);
    redirect("/store");
  }

  const email = id.includes("@") ? id : loginIdToEmail(id);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "IDまたはパスワードが正しくありません" };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  // scope: "local" = この端末のログインだけを終える。
  // 既定の signOut() は global で、同じアカウントの全端末・全アプリのログインを消す。
  // 店舗アカウント（golfwing 等）は複数のタブレット・アプリで共用しているため、1台でログアウトすると
  // 他の端末が次の操作で白い画面（Application error）になっていた（money-os 2026-09-17）。
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
