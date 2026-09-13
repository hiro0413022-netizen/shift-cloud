"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { searchProducts, type ProductRow } from "@/lib/craft";

/** 未一致の試打シャフトを、商品マスタの1件に手で紐づける */
export async function linkDemoShaft(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const demoNo = Number(formData.get("demo_no"));
  const productId = Number(formData.get("product_id"));
  if (!demoNo || !productId) return;

  await createAdmin()
    .from("gw_demo_shafts")
    .update({
      product_id: productId,
      match_status: "manual",
      match_note: `${actor.name} が手で紐づけ（${new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）`,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", actor.companyId)
    .eq("demo_no", demoNo);
  revalidatePath("/demo-shafts");
}

/** 商品マスタに無い（廃盤で登録もしない）ものを、台帳の上で閉じる */
export async function markNoProduct(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const demoNo = Number(formData.get("demo_no"));
  if (!demoNo) return;
  await createAdmin()
    .from("gw_demo_shafts")
    .update({
      match_status: "no_product",
      match_note: `商品マスタに登録しない（${actor.name}）`,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", actor.companyId)
    .eq("demo_no", demoNo);
  revalidatePath("/demo-shafts");
}

/** 棚番号・状態・メモを直す */
export async function updateDemoShaft(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const demoNo = Number(formData.get("demo_no"));
  if (!demoNo) return;
  const shelf = String(formData.get("shelf") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "在庫");
  await createAdmin()
    .from("gw_demo_shafts")
    .update({ shelf, status, note: String(formData.get("note") ?? "").trim() || null, updated_at: new Date().toISOString() })
    .eq("company_id", actor.companyId)
    .eq("demo_no", demoNo);
  revalidatePath("/demo-shafts");
}

export async function findProductsForDemo(
  _prev: { rows?: ProductRow[]; demoNo?: number },
  formData: FormData
): Promise<{ rows?: ProductRow[]; demoNo?: number }> {
  const actor = await requireActor();
  const q = String(formData.get("dq") ?? "");
  const demoNo = Number(formData.get("demo_no"));
  return { rows: await searchProducts(actor, q, { category: "シャフト" }), demoNo };
}
