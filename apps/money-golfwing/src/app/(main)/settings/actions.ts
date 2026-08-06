"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, canWriteStore, toNum } from "@/lib/money";

/** 担当プロを追加（現在店舗）。同名は unique index で弾かれる（無言スキップ）。 */
export async function addPro(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  const name = String(formData.get("name") ?? "").trim();
  if (!store || !name || !canWriteStore(actor, store.id)) return;

  const admin = createAdmin();
  await admin.from("mon_pros").insert({
    company_id: actor.companyId,
    store_id: store.id,
    name,
    sort_order: toNum(formData.get("sort_order")) || 100,
  });
  revalidatePath("/settings");
  revalidatePath("/sales");
}

/** 有効/無効の切替（退任等。過去明細はそのまま）。 */
export async function toggleProActive(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;
  await admin.from("mon_pros")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", actor.companyId);
  revalidatePath("/settings");
  revalidatePath("/sales");
}

/** 並び順の更新。 */
export async function updateProOrder(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await admin.from("mon_pros")
    .update({ sort_order: toNum(formData.get("sort_order")) || 100, updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", actor.companyId);
  revalidatePath("/settings");
  revalidatePath("/sales");
}

/**
 * 給与連携の設定を更新（DECISIONS #105 / migration 0094）。
 * - staff_id     … 誰の手当になるか（未選択なら手当に取り込まれない）
 * - payout_mode  … payroll=給与の手当 / outsourcing=外注費に上乗せ / none=対象外
 * - aliases      … 売上台帳の表記ゆれ・通称（読点/カンマ/スペース区切り。例:「春馬」）
 */
export async function updateProPayroll(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const staffId = String(formData.get("staff_id") ?? "").trim();
  const mode = String(formData.get("payout_mode") ?? "payroll");
  const aliases = String(formData.get("aliases") ?? "")
    .split(/[,、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 不正値でCHECK制約に落とさない（UIのselect以外から来た場合の保険）
  const payoutMode = ["payroll", "outsourcing", "none"].includes(mode) ? mode : "payroll";

  await admin
    .from("mon_pros")
    .update({
      staff_id: staffId || null,
      payout_mode: payoutMode,
      aliases,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  revalidatePath("/settings");
}

/** 削除（論理削除）。 */
export async function deletePro(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await admin.from("mon_pros")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", actor.companyId);
  revalidatePath("/settings");
  revalidatePath("/sales");
}
