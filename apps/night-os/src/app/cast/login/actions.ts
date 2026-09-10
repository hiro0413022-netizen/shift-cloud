"use server";

import { redirect } from "next/navigation";
import { signInCast } from "@/lib/cast";
import { resolveNightStore } from "@/lib/night";

export async function castLogin(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const store = await resolveNightStore();
  if (!store) return { error: "店舗が見つかりません" };
  const phone = String(formData.get("phone") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const res = await signInCast(store.id, phone, pin);
  if (res.error) return res;
  redirect("/cast");
}
