import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type ReserveActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
};

/**
 * Reserve OS（予約管理）は use_reception 権限、または view_hq（経営層）保持者のみアクセス可。
 * ロール・権限データは Genesis / Shift Cloud / Member OS と共通（同一DB）。DECISIONS #27。
 */
export const getReserveActor = cache(async (): Promise<ReserveActor | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdmin();
  const { data: staff } = await admin
    .from("staff")
    .select("id, company_id, name, email, status, staff_roles(deleted_at, roles(permissions))")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .single();
  if (!staff || staff.status !== "active") return null;

  const roleRows = ((staff as unknown as { staff_roles?: Array<{ deleted_at: string | null; roles: { permissions: Record<string, boolean> } | null }> }).staff_roles ?? [])
    .filter((r) => r.deleted_at == null);

  const hasAccess = (roleRows ?? []).some((row) => {
    const perms = (row as unknown as { roles: { permissions: Record<string, boolean> } | null }).roles?.permissions;
    if (!perms || perms.read_only) return false;
    return !!perms.use_reception || !!perms.view_hq;
  });
  if (!hasAccess) return null;

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    email: staff.email,
  };
});

export async function requireReserveActor(): Promise<ReserveActor> {
  const actor = await getReserveActor();
  if (!actor) redirect("/login?denied=1");
  return actor;
}
