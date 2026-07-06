import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type MoneyGrant = { segmentId: string; role: "input" | "manager" | "viewer" };

export type MoneyActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
  /** 全事業横断（本部経理・経営層） */
  canManageAll: boolean;
  /** 事業別権限（mon_grants） */
  grants: MoneyGrant[];
};

/**
 * お金管理は view_hq / manage_money_all（横断）または mon_grants を持つスタッフのみ。
 * ロール・権限データはGenesis / Shift Cloud / Member OSと共通（同一DB, DECISIONS #27）。
 */
export async function getMoneyActor(): Promise<MoneyActor | null> {
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

  const canManageAll = (roleRows ?? []).some((row) => {
    const perms = (row as unknown as { roles: { permissions: Record<string, boolean> } | null })
      .roles?.permissions;
    if (!perms) return false;
    return !!perms.view_hq || !!perms.manage_money_all;
  });

  const { data: grantRows } = await admin
    .from("mon_grants")
    .select("segment_id, role")
    .eq("company_id", staff.company_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const grants: MoneyGrant[] = (grantRows ?? []).map((g) => ({
    segmentId: String(g.segment_id),
    role: g.role as MoneyGrant["role"],
  }));

  if (!canManageAll && grants.length === 0) return null;

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    email: staff.email,
    canManageAll,
    grants,
  };
}

export async function requireMoneyActor(): Promise<MoneyActor> {
  const actor = await getMoneyActor();
  if (!actor) redirect("/login?denied=1");
  return actor;
}

/** 取込・全事業横断操作は本部経理/経営層のみ */
export async function requireManageAll(): Promise<MoneyActor> {
  const actor = await requireMoneyActor();
  if (!actor.canManageAll) redirect("/?denied=1");
  return actor;
}
