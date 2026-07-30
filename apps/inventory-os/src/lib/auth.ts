import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type InventoryRole = "manager" | "counter";

export type InventoryActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  role: InventoryRole;
  /** 品番マスタの編集・棚卸の確定・入出庫の手動記録ができる */
  canManage: boolean;
  /** 棚卸のカウント入力ができる（全員） */
  storeIds: string[];
};

/**
 * Inventory OS は use_inventory 権限、または view_hq（経営層）保持者のみアクセス可。
 * 権限データはGenesis / Shift Cloudと共通（同一DB）。
 *
 * ロール解決:
 *   - view_hq / manage_inventory を持つ = manager（マスタ編集・棚卸確定・入出庫記録）
 *   - use_inventory のみ = counter（棚卸のカウント入力まで）
 *
 * 店舗スタッフがiPadで数えるだけの運用を想定しているため、counter の権限は意図的に狭い。
 * 数え間違いの訂正は棚卸を締める前ならcounterでもできる（締めるのはmanagerだけ）。
 */
export const getInventoryActor = cache(async (): Promise<InventoryActor | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdmin();
  const { data: staff } = await admin
    .from("staff")
    .select("id, company_id, name, status, staff_roles(deleted_at, roles(permissions))")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .single();
  if (!staff || staff.status !== "active") return null;

  const roleRows = (
    (staff as unknown as {
      staff_roles?: Array<{ deleted_at: string | null; roles: { permissions: Record<string, boolean> } | null }>;
    }).staff_roles ?? []
  ).filter((r) => r.deleted_at == null);

  let hasHq = false;
  let hasUse = false;
  let hasManage = false;
  for (const row of roleRows) {
    const perms = row.roles?.permissions;
    if (!perms) continue;
    if (perms.view_hq) hasHq = true;
    if (perms.use_inventory) hasUse = true;
    if (perms.manage_inventory) hasManage = true;
  }

  let role: InventoryRole | null = null;
  if (hasHq || hasManage) role = "manager";
  else if (hasUse) role = "counter";
  if (!role) return null;

  // 配属店舗（無ければ全店＝本部扱い）
  const { data: assign } = await admin
    .from("staff_store_assignments")
    .select("store_id")
    .eq("staff_id", staff.id)
    .eq("status", "active")
    .is("deleted_at", null);

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    role,
    canManage: role === "manager",
    storeIds: (assign ?? []).map((a) => (a as { store_id: string }).store_id),
  };
});

export async function requireInventoryActor(): Promise<InventoryActor> {
  const actor = await getInventoryActor();
  if (!actor) redirect("/login?denied=1");
  return actor;
}

export async function requireManager(): Promise<InventoryActor> {
  const actor = await requireInventoryActor();
  if (!actor.canManage) redirect("/?denied=1");
  return actor;
}
