import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type Permission =
  | "manage_company"
  | "manage_org"
  | "manage_staff"
  | "manage_templates"
  | "create_shifts"
  | "edit_attendance"
  | "view_payroll"
  | "manage_payroll"
  | "view_hq"
  | "manage_announcements"
  | "approve_suggestions"
  | "manage_kiosks"
  | "view_audit";

export type Actor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
  permissions: Partial<Record<Permission | "read_only", boolean>>;
  storeIds: string[];
  primaryStoreId: string | null;
};

/** ログインID→擬似メール変換（DECISIONS #2） */
export function loginIdToEmail(loginId: string) {
  return `${loginId.toLowerCase()}@staff.yozan.internal`;
}

export async function getActor(): Promise<Actor | null> {
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

  const [{ data: roleRows }, { data: assigns }] = await Promise.all([
    admin
      .from("staff_roles")
      .select("roles(permissions)")
      .eq("staff_id", staff.id)
      .is("deleted_at", null),
    admin
      .from("staff_store_assignments")
      .select("store_id, is_primary")
      .eq("staff_id", staff.id)
      .is("deleted_at", null),
  ]);

  const permissions: Actor["permissions"] = {};
  for (const row of roleRows ?? []) {
    const perms = (row as unknown as { roles: { permissions: Record<string, boolean> } | null })
      .roles?.permissions;
    if (perms) Object.assign(permissions, perms);
  }

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    email: staff.email,
    permissions,
    storeIds: (assigns ?? []).map((a) => a.store_id),
    primaryStoreId: (assigns ?? []).find((a) => a.is_primary)?.store_id ?? null,
  };
}

export function can(actor: Actor, perm: Permission) {
  if (actor.permissions.read_only) return false;
  return !!actor.permissions[perm];
}

export function isAdmin(actor: Actor) {
  return (
    ["manage_staff", "manage_org", "create_shifts", "edit_attendance", "view_payroll"] as Permission[]
  ).some((p) => !!actor.permissions[p]);
}

/** 認証必須。permを渡すと権限チェックも行う */
export async function requireActor(perm?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (perm && !can(actor, perm)) throw new Error("FORBIDDEN: " + perm);
  return actor;
}
