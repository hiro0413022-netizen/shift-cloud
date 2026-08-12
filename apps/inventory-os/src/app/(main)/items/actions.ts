"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { createItem, canAccessStore } from "@/lib/inventory";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

export async function addItem(_prev: { error?: string; code?: string }, formData: FormData) {
  const actor = await requireManager();
  const category = str(formData.get("category"));
  const maker = str(formData.get("maker"));
  const name = str(formData.get("name"));
  if (!category || !maker || !name) return { error: "品目・メーカー・商品名は必須です" };

  const r = await createItem(actor, {
    category,
    maker,
    name,
    spec: str(formData.get("spec")),
    variant: str(formData.get("variant")),
    unit: String(formData.get("unit") ?? "個"),
    location1: str(formData.get("location1")),
    location2: str(formData.get("location2")),
    listPrice: num(formData.get("listPrice")),
    costPrice: num(formData.get("costPrice")),
    reorderPoint: num(formData.get("reorderPoint")),
    storeId: str(formData.get("storeId")),
  });
  if ("error" in r) return { error: r.error };
  revalidatePath("/items");
  return { code: r.code };
}

export async function updateItem(formData: FormData) {
  const actor = await requireManager();
  const id = String(formData.get("id"));
  const admin = createAdmin();

  // 他店舗の品番は編集させない（#134。company_id だけでは店舗またぎを止められない）
  const { data: target } = await admin
    .from("inv_items")
    .select("id, store_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  const t = target as { id: string; store_id: string | null } | null;
  if (!t || !canAccessStore(actor, t.store_id)) redirect("/items?denied=1");

  await admin
    .from("inv_items")
    .update({
      name: str(formData.get("name")) ?? "",
      spec: str(formData.get("spec")),
      variant: str(formData.get("variant")),
      unit: String(formData.get("unit") ?? "個"),
      location1: str(formData.get("location1")),
      location2: str(formData.get("location2")),
      list_price: num(formData.get("listPrice")),
      cost_price: num(formData.get("costPrice")),
      reorder_point: num(formData.get("reorderPoint")),
      status: String(formData.get("status") ?? "active"),
      notes: str(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  redirect(`/items/${id}?saved=1`);
}

/** コード表への追加。略号の重複はDBのunique indexが最終防衛（エクセルVBAの重複チェック相当） */
export async function addCode(_prev: { error?: string; ok?: string }, formData: FormData) {
  const actor = await requireManager();
  const kind = String(formData.get("kind"));
  const name = str(formData.get("name"));
  const abbr = str(formData.get("abbr"))?.toUpperCase();
  if (!name || !abbr) return { error: "名称と略号を入力してください" };
  if (!/^[A-Z]{2,3}$/.test(abbr)) return { error: "略号は英大文字2〜3字で入力してください" };
  if (kind !== "category" && kind !== "maker") return { error: "種別が不正です" };

  const admin = createAdmin();
  const { error } = await admin.from("inv_codes").insert({
    company_id: actor.companyId,
    kind,
    name,
    abbr,
  });
  if (error) {
    return {
      error: error.code === "23505" ? `略号「${abbr}」または名称「${name}」はすでに使われています` : error.message,
    };
  }
  revalidatePath("/items/new");
  return { ok: `${name}（${abbr}）を追加しました` };
}
