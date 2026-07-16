import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Empty } from "@/components/ui";
import { AccountsTable, type StaffRow, type Role, type Perms } from "./accounts-ui";

export const dynamic = "force-dynamic";

type RoleJoin = { role_id: string; roles: { name: string; permissions: Perms } | null };

export default async function AccountsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const [{ data: staffData }, { data: roleData }, { data: myRoles }] = await Promise.all([
    admin
      .from("staff")
      .select("id, name, login_id, status, auth_user_id")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("status", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("roles")
      .select("id, name")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("name"),
    admin.from("staff_roles").select("roles(permissions)").eq("staff_id", actor.staffId).is("deleted_at", null),
  ]);

  const canManage = (myRoles ?? []).some(
    (r) => (r as unknown as { roles: { permissions: Perms } | null }).roles?.permissions?.manage_staff
  );

  const staffIds = (staffData ?? []).map((s) => s.id);
  const { data: srData } = staffIds.length
    ? await admin
        .from("staff_roles")
        .select("staff_id, role_id, roles(name, permissions)")
        .in("staff_id", staffIds)
        .is("deleted_at", null)
    : { data: [] as unknown[] };

  const roleByStaff = new Map<string, RoleJoin>();
  for (const row of (srData ?? []) as unknown as (RoleJoin & { staff_id: string })[]) {
    if (!roleByStaff.has(row.staff_id)) roleByStaff.set(row.staff_id, row);
  }

  const staff: StaffRow[] = (staffData ?? []).map((s) => {
    const rj = roleByStaff.get(s.id);
    return {
      id: s.id,
      name: s.name,
      login_id: s.login_id,
      status: s.status,
      hasLogin: !!s.auth_user_id,
      roleId: rj?.role_id ?? null,
      roleName: rj?.roles?.name ?? "—",
      perms: rj?.roles?.permissions ?? {},
    };
  });
  const roles: Role[] = (roleData ?? []) as Role[];

  const activeCount = staff.filter((s) => s.status === "active").length;
  const noLogin = staff.filter((s) => !s.hasLogin).length;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-bold">アカウント管理</h1>
        <p className="mt-1 text-xs text-(--color-dim)">
          全スタッフのシステム別アクセス権を1画面で管理。役割の付与・有効/停止・ログイン発行・スタッフ追加ができます。
          在籍 {activeCount} 名／ログイン未発行 {noLogin} 名。
        </p>
      </div>

      {!canManage && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          閲覧のみ可能です。変更するには manage_staff 権限（本部／店舗責任者など）が必要です。
        </div>
      )}

      {staff.length === 0 ? <Empty>スタッフがいません</Empty> : <AccountsTable staff={staff} roles={roles} />}
    </div>
  );
}
