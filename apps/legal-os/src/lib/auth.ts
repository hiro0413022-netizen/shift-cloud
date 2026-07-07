import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type LegalRole = "manager" | "uploader" | "viewer";

export type LegalActor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
  role: LegalRole;
  /** アップロード・下書き登録ができる（uploader / manager） */
  canWrite: boolean;
  /** 全社契約の管理・期限設定・削除申請ができる（manager） */
  canManage: boolean;
};

/**
 * Legal OS は use_legal 権限、または view_hq（経営層）保持者のみアクセス可。
 * ロール・権限データはGenesis / Shift Cloudと共通（同一DB）。
 *
 * アプリ内ロール解決:
 *   - view_hq / manage_legal_all を持つ = manager（全社管理）
 *   - leg_grants に行がある = その role
 *   - use_legal のみ = uploader（下書き登録まで）
 */
export async function getLegalActor(): Promise<LegalActor | null> {
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

  let hasHq = false;
  let hasLegalPerm = false;
  let hasManageAll = false;
  for (const row of roleRows ?? []) {
    const perms = (row as unknown as { roles: { permissions: Record<string, boolean> } | null })
      .roles?.permissions;
    if (!perms) continue;
    if (perms.view_hq) hasHq = true;
    if (perms.use_legal) hasLegalPerm = true;
    if (perms.manage_legal_all) hasManageAll = true;
  }

  // leg_grants によるアプリ内ロール（存在すれば優先度: manager > uploader > viewer）
  const { data: grants } = await admin
    .from("leg_grants")
    .select("role")
    .eq("company_id", staff.company_id)
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const grantRoles = new Set((grants ?? []).map((g) => (g as { role: string }).role));

  let role: LegalRole | null = null;
  if (hasHq || hasManageAll || grantRoles.has("manager")) role = "manager";
  else if (grantRoles.has("uploader") || hasLegalPerm) role = "uploader";
  else if (grantRoles.has("viewer")) role = "viewer";

  if (!role) return null; // アクセス権なし

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    email: staff.email,
    role,
    canWrite: role === "manager" || role === "uploader",
    canManage: role === "manager",
  };
}

export async function requireLegalActor(): Promise<LegalActor> {
  const actor = await getLegalActor();
  if (!actor) redirect("/login?denied=1");
  return actor;
}
