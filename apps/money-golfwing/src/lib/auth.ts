import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type AccessibleStore = { id: string; name: string; segmentId: string | null; isPrimary: boolean };

export type MoneyActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
  /** 全店舗横断（本部経理・経営層: view_hq / manage_money_all） */
  canManageAll: boolean;
  /** アクセスできる店舗（本部=全店舗 / 現場=Shift Cloudの配属店舗） */
  stores: AccessibleStore[];
};

/**
 * お金管理のアクセスは「Shift Cloudの店舗配属」を流用（DECISIONS #27, 同一DB）。
 * - view_hq / manage_money_all を持つ人 = 全店舗を閲覧・締め
 * - それ以外 = staff_store_assignments で配属された店舗のみ入力可
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

  let stores: AccessibleStore[] = [];
  if (canManageAll) {
    const { data } = await admin
      .from("stores")
      .select("id, name, segment_id")
      .eq("company_id", staff.company_id)
      .is("deleted_at", null)
      .order("name");
    stores = (data ?? []).map((s) => ({
      id: String(s.id), name: String(s.name), segmentId: s.segment_id ? String(s.segment_id) : null, isPrimary: false,
    }));
  } else {
    const { data } = await admin
      .from("staff_store_assignments")
      .select("is_primary, stores(id, name, segment_id, deleted_at)")
      .eq("staff_id", staff.id)
      .is("deleted_at", null);
    stores = (data ?? [])
      .map((a) => {
        const st = (a as unknown as { stores: { id: string; name: string; segment_id: string | null; deleted_at: string | null } | null }).stores;
        if (!st || st.deleted_at) return null;
        return { id: String(st.id), name: String(st.name), segmentId: st.segment_id ? String(st.segment_id) : null, isPrimary: !!(a as { is_primary?: boolean }).is_primary };
      })
      .filter((x): x is AccessibleStore => x !== null);
  }

  if (!canManageAll && stores.length === 0) return null;

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    email: staff.email,
    canManageAll,
    stores,
  };
}

export async function requireMoneyActor(): Promise<MoneyActor> {
  const actor = await getMoneyActor();
  if (!actor) redirect("/login?denied=1");
  return actor;
}

/** カード・口座取込など全店舗横断操作は本部のみ */
export async function requireManageAll(): Promise<MoneyActor> {
  const actor = await requireMoneyActor();
  if (!actor.canManageAll) redirect("/?denied=1");
  return actor;
}
