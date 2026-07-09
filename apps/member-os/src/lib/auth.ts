import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type ReceptionActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
};

/**
 * Member OS（体験受付）は use_reception 権限、または view_hq（経営層）保持者のみアクセス可。
 * ロール・権限データはGenesis / Shift Cloudと共通（同一DB）。DECISIONS #27。
 */
export const getReceptionActor = cache(async (): Promise<ReceptionActor | null> => {
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

  const roleRows = ((staff as { staff_roles?: Array<{ deleted_at: string | null; roles: { permissions: Record<string, boolean> } | null }> }).staff_roles ?? [])
    .filter((r) => r.deleted_at == null);

  const hasAccess = (roleRows ?? []).some((row) => {
    const perms = (row as unknown as { roles: { permissions: Record<string, boolean> } | null })
      .roles?.permissions;
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

export async function requireReceptionActor(): Promise<ReceptionActor> {
  const actor = await getReceptionActor();
  if (!actor) redirect("/login?denied=1");
  return actor;
}
