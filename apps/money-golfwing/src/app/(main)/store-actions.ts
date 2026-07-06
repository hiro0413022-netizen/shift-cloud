"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STORE_COOKIE } from "@/lib/money";

/** 店舗切替。cookieに保存して全ページを再描画。 */
export async function setStore(formData: FormData): Promise<void> {
  const id = String(formData.get("store_id") ?? "").trim();
  if (id) {
    const jar = await cookies();
    jar.set(STORE_COOKIE, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  revalidatePath("/", "layout");
}
