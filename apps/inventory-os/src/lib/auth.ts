import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type InventoryRole = "manager" | "counter";

export type InventoryStore = { id: string; name: string; isPrimary: boolean };

export type InventoryActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  role: InventoryRole;
  /** 品番マスタの編集・棚卸の確定・入出庫の手動記録ができる */
  canManage: boolean;
  /**
   * オーナー（manage_company）。全店舗を横断して在庫を見られる唯一の立場（#128/#134）。
   * view_hq は「本部」も持つのでオーナー判定には使わない。
   */
  isOwner: boolean;
  /** 見てよい店舗。オーナー＝会社の全店舗 / それ以外＝配属店舗のみ（#134） */
  stores: InventoryStore[];
  /** stores のID（既存呼び出しの互換用） */
  storeIds: string[];
  /** 主配属（is_primary）。無ければ先頭。新規登録の既定店舗になる（#134） */
  primaryStoreId: string | null;
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

  // オーナー判定は manage_company のみ（#128）。view_hq は本部スタッフも持つので使えない
  const isOwner = roleRows.some((row) => {
    const perms = row.roles?.permissions;
    return !!perms && !perms.read_only && !!perms.manage_company;
  });

  // 見てよい店舗（#134）。
  // ここは以前 staff_store_assignments に `.eq("status","active")` を付けており、
  // その列が存在しないためクエリが常に失敗して storeIds が必ず [] になっていた
  // ＝店舗スコープが効かず全店合算になっていた。存在する列（deleted_at）で絞る。
  let stores: InventoryStore[] = [];
  if (isOwner) {
    const { data } = await admin
      .from("stores")
      .select("id, name")
      .eq("company_id", staff.company_id)
      .is("deleted_at", null)
      .order("name");
    stores = ((data ?? []) as Array<{ id: string; name: string }>).map((s) => ({
      id: String(s.id),
      name: String(s.name),
      isPrimary: false,
    }));
  } else {
    const { data } = await admin
      .from("staff_store_assignments")
      .select("is_primary, stores(id, name, deleted_at)")
      .eq("staff_id", staff.id)
      .is("deleted_at", null);
    type AssignRow = {
      is_primary: boolean | null;
      stores: { id: string; name: string; deleted_at: string | null } | null;
    };
    stores = ((data ?? []) as unknown as AssignRow[])
      .map((a) =>
        a.stores && !a.stores.deleted_at
          ? { id: String(a.stores.id), name: String(a.stores.name), isPrimary: !!a.is_primary }
          : null
      )
      .filter((s): s is InventoryStore => s !== null)
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  const storeIds = stores.map((s) => s.id);

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    role,
    canManage: role === "manager",
    isOwner,
    stores,
    storeIds,
    primaryStoreId: stores.find((s) => s.isPrimary)?.id ?? storeIds[0] ?? null,
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
