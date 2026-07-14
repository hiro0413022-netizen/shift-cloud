import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type GenesisActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
};

/**
 * Genesis Cockpitは view_hq 権限保持者のみアクセス可（DECISIONS #18）。
 * ロール・権限データはShift Cloudと共通（同一DB）。
 */
export async function getGenesisActor(): Promise<GenesisActor | null> {
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

  const hasViewHq = (roleRows ?? []).some((row) => {
    const perms = (row as unknown as { roles: { permissions: Record<string, boolean> } | null })
      .roles?.permissions;
    return !!perms?.view_hq && !perms?.read_only;
  });
  if (!hasViewHq) return null;

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    email: staff.email,
  };
}

export async function requireGenesisActor(): Promise<GenesisActor> {
  const actor = await getGenesisActor();
  if (!actor) redirect("/login?denied=1");
  return actor;
}
