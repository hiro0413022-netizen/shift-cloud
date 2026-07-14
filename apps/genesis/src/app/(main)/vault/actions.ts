"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";
import { VAULT_COOKIE, isVaultUnlocked, sha256, vaultHash } from "@/lib/vault";

export async function unlockVault(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const actor = await requireGenesisActor();
  const input = String(formData.get("password") ?? "");
  if (sha256(input) !== vaultHash()) return { error: "パスワードが違います" };

  const store = await cookies();
  store.set(VAULT_COOKIE, vaultHash(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8, // 8時間
    path: "/",
  });
  await logAudit(actor, "vault.unlock", "vault_systems", actor.staffId);
  revalidatePath("/vault");
  return {};
}

export async function lockVault(): Promise<void> {
  const store = await cookies();
  store.delete(VAULT_COOKIE);
  revalidatePath("/vault");
}

async function requireVault() {
  const actor = await requireGenesisActor();
  if (!(await isVaultUnlocked())) throw new Error("Vaultがロックされています");
  return actor;
}

export async function saveSystem(formData: FormData): Promise<void> {
  const actor = await requireVault();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "other"),
    url: String(formData.get("url") ?? "").trim() || null,
    login_id: String(formData.get("login_id") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    sort_order: Number(formData.get("sort_order") ?? 100) || 100,
  };
  if (!values.name) return;

  if (id) {
    // パスワード欄が空のままなら既存値を維持（誤消去防止）。消したい場合は「-」を入力
    const update =
      password === "" ? values : { ...values, password: password === "-" ? null : password };
    await admin.from("vault_systems").update(update).eq("id", id).eq("company_id", actor.companyId);
    await logAudit(actor, "vault.update", "vault_systems", id);
  } else {
    const { data } = await admin
      .from("vault_systems")
      .insert({ ...values, password: password || null, company_id: actor.companyId })
      .select("id")
      .single();
    await logAudit(actor, "vault.create", "vault_systems", data?.id ?? "new");
  }
  revalidatePath("/vault");
}

export async function deleteSystem(formData: FormData): Promise<void> {
  const actor = await requireVault();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdmin();
  await admin
    .from("vault_systems")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  await logAudit(actor, "vault.delete", "vault_systems", id);
  revalidatePath("/vault");
}
