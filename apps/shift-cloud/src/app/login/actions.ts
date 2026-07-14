"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginIdToEmail } from "@/lib/auth";

export async function login(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get("id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!id || !password) return { error: "IDとパスワードを入力してください" };

  const email = id.includes("@") ? id : loginIdToEmail(id);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "IDまたはパスワードが正しくありません" };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
