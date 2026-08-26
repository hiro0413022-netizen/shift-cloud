"use server";

import { revalidatePath } from "next/cache";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank, requireStoreAccess, FRANK_STORE_ID } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";

const s = (v: unknown) => (typeof v === "string" ? v : "");

async function guard() {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) throw new Error("FORBIDDEN: frank");
  requireStoreAccess(actor, FRANK_STORE_ID);
  return actor;
}

/**
 * 売り切れの切替（#155）。
 * 第一弾は在庫連動ではなく手動トグル（Inventory OS との連動は必要になってから）。
 * 押した瞬間からお客様のメニューで選べなくなる。
 */
export async function toggleSoldOut(formData: FormData) {
  await guard();
  const id = s(formData.get("id"));
  const to = s(formData.get("to")) === "1";
  if (!id) return;
  const admin = createAdmin();
  await admin.from("frunk_menu_items").update({ sold_out: to }).eq("id", id).is("deleted_at", null);
  revalidatePath("/orders/menu");
  revalidatePath("/member/order");
}

/** メニューから外す／戻す（季節商品など。行は消さない＝過去の伝票の紐付けを壊さない） */
export async function toggleActive(formData: FormData) {
  await guard();
  const id = s(formData.get("id"));
  const to = s(formData.get("to")) === "1";
  if (!id) return;
  const admin = createAdmin();
  await admin.from("frunk_menu_items").update({ active: to }).eq("id", id).is("deleted_at", null);
  revalidatePath("/orders/menu");
}

/**
 * 価格の変更（税込）。
 * ⚠ 変えるのは**これから注文される分だけ**。過去の伝票は frunk_order_items に
 * 注文時点の単価がコピーされているので影響を受けない。
 * ⚠ Squareのカタログ（scripts/frank-square-setup.mjs）と食い違うと、
 * 店頭レジで打つ金額とスマホ注文の金額がズレる。**両方直すこと。**
 */
export async function updatePrice(formData: FormData) {
  await guard();
  const id = s(formData.get("id"));
  const general = Number(formData.get("price_general") ?? 0);
  const member = Number(formData.get("price_member") ?? 0);
  if (!id || !Number.isFinite(general) || !Number.isFinite(member)) return;
  if (general < 0 || member < 0 || general > 100000 || member > 100000) return;
  const admin = createAdmin();
  await admin.from("frunk_menu_items")
    .update({ price_general: Math.round(general), price_member: Math.round(member) })
    .eq("id", id).is("deleted_at", null);
  revalidatePath("/orders/menu");
  revalidatePath("/member/order");
}
