"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { addMovement, deleteMovementById, canAccessStore, type MovementKind } from "@/lib/inventory";
import { createAdmin } from "@/lib/supabase/admin";

export async function recordMovement(_prev: { error?: string; ok?: string }, formData: FormData) {
  const actor = await requireManager();
  const code = String(formData.get("code") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as MovementKind;
  const qty = Number(formData.get("qty") ?? 0);
  const occurredOn = String(formData.get("occurredOn") ?? "").trim() || undefined;
  const memo = String(formData.get("memo") ?? "").trim() || null;

  if (!code) return { error: "管理番号を入力してください" };

  const admin = createAdmin();
  const { data: item } = await admin
    .from("inv_items")
    .select("id, store_id, name, unit, cost_price")
    .eq("company_id", actor.companyId)
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!item) return { error: `管理番号「${code}」の品番が見つかりません` };
  const it = item as { id: string; store_id: string | null; name: string; unit: string; cost_price: number | null };
  // 管理番号を直接打てば他店舗の在庫も動かせてしまうため、ここで店舗を確認する（#134）
  if (!canAccessStore(actor, it.store_id)) return { error: `管理番号「${code}」は自店舗の品番ではありません` };

  const r = await addMovement(actor, {
    itemId: it.id,
    storeId: it.store_id,
    kind,
    qty,
    occurredOn,
    memo,
    unitCost: it.cost_price,
  });
  if (r.error) return { error: r.error };

  revalidatePath("/movements");
  revalidatePath("/");
  return { ok: `${it.name} を ${Math.abs(Math.trunc(qty))}${it.unit} 記録しました` };
}

export async function deleteMovement(formData: FormData) {
  const actor = await requireManager();
  const id = String(formData.get("id"));
  // 論理削除。理論在庫の計算からは即座に外れる。
  // 会社・店舗の確認は deleteMovementById 側で行う（#134。以前は id だけで消せた）
  await deleteMovementById(actor, id);
  revalidatePath("/movements");
  revalidatePath("/");
}
