import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type GenesisActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
  /**
   * オーナー（最高権限）。manage_company を持つ人だけ true で、全店舗を横断できる（#128/#134）。
   * view_hq は「本部」「役員」も持つため、全店横断の判定には使わない（#128a）。
   */
  isOwner: boolean;
  /** 見てよい店舗。オーナー＝会社の全 active 店舗 / それ以外＝配属店舗（staff_store_assignments）（#134） */
  storeIds: string[];
  /** 主所属（is_primary）。無ければ storeIds の先頭（#134） */
  primaryStoreId: string | null;
};

/**
 * Genesis Cockpitは view_hq 権限保持者のみアクセス可（DECISIONS #18）。
 * ロール・権限データはShift Cloudと共通（同一DB）。
 *
 * 店舗スコープ（#134）: 実装は packages/core/src/auth.ts の createActorResolver が正典。
 * Genesis は core を使わず独自解決しているため、同じロジックをここに移植している。
 * （core 側を直したらこちらも直すこと）
 */
export const getGenesisActor = cache(async (): Promise<GenesisActor | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdmin();
  const { data: staff } = await admin
    .from("staff")
    .select("id, company_id, name, email, status")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .single();
  if (!staff || staff.status !== "active") return null;

  const { data: roleRows } = await admin
    .from("staff_roles")
    .select("roles(permissions)")
    .eq("staff_id", staff.id)
    .is("deleted_at", null);

  const permsOf = (row: unknown) =>
    (row as { roles: { permissions: Record<string, boolean> | null } | null }).roles?.permissions ?? null;

  const hasViewHq = (roleRows ?? []).some((row) => {
    const perms = permsOf(row);
    return !!perms?.view_hq && !perms?.read_only;
  });
  if (!hasViewHq) return null;

  // オーナー判定は manage_company のみ（view_hq は本部・役員も持つので全店横断には使えない・#128a）
  const isOwner = (roleRows ?? []).some((row) => {
    const perms = permsOf(row);
    return !!perms && !perms.read_only && !!perms.manage_company;
  });

  // 店舗スコープ: オーナー＝会社の全 active 店舗、それ以外＝配属店舗のみ（店舗またぎ事故の防止・#128）
  let storeIds: string[] = [];
  let primaryStoreId: string | null = null;
  if (isOwner) {
    const { data: stores } = await admin
      .from("stores")
      .select("id")
      .eq("company_id", staff.company_id)
      .eq("status", "active")
      .is("deleted_at", null);
    storeIds = ((stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    primaryStoreId = storeIds[0] ?? null;
  } else {
    // staff_store_assignments に status 列は無い。生存判定は deleted_at のみ（0001_foundation.sql:69-79）
    const { data: assigns } = await admin
      .from("staff_store_assignments")
      .select("store_id, is_primary")
      .eq("staff_id", staff.id)
      .is("deleted_at", null);
    const rows = (assigns ?? []) as Array<{ store_id: string; is_primary: boolean | null }>;
    storeIds = rows.map((r) => r.store_id);
    primaryStoreId = rows.find((r) => r.is_primary)?.store_id ?? storeIds[0] ?? null;
  }

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    email: staff.email,
    isOwner,
    storeIds,
    primaryStoreId,
  };
});

export async function requireGenesisActor(): Promise<GenesisActor> {
  const actor = await getGenesisActor();
  if (!actor) redirect("/login?denied=1");
  return actor;
}

/**
 * 画面で見せてよい店舗（#134）。
 * オーナー = 会社の全店舗 / それ以外 = 配属店舗のみ。
 * ライブラリ側の集計関数には、ここで得た id 配列を引数で渡す（cron は actor が無いので絞らない）。
 */
export async function visibleStores(actor: GenesisActor): Promise<Array<{ id: string; name: string }>> {
  if (!actor.isOwner && actor.storeIds.length === 0) return [];
  const admin = createAdmin();
  let q = admin
    .from("stores")
    .select("id, name")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("name");
  if (!actor.isOwner) q = q.in("id", actor.storeIds);
  const { data } = await q;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

/**
 * 店舗スコープの絞り込み値（#134）。
 * オーナーは null（＝絞らない＝全店比較を見てよい）、それ以外は配属店舗の id 配列。
 * 集計関数の storeIds 引数にそのまま渡せる形。
 */
export function storeScope(actor: GenesisActor): string[] | null {
  return actor.isOwner ? null : actor.storeIds;
}

/**
 * サーバー側の店舗アクセス検証（#134）。UI非表示だけに頼らない。
 * 他店舗のIDを直打ちされたら例外で止める。
 */
export function assertStoreAccess(actor: GenesisActor, storeId: string | null | undefined): void {
  if (!storeId) return; // 店舗未設定のデータは全社扱い
  if (actor.isOwner) return;
  if (!actor.storeIds.includes(storeId)) {
    throw new Error("FORBIDDEN: 他店舗のデータにはアクセスできません（#134）");
  }
}
