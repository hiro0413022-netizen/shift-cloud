import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Table, Td, Badge, Button, Empty } from "@/components/ui";
import { StaffForm, type StaffEdit } from "./staff-form";
import { deactivateStaff } from "./actions";
import { yen } from "@/lib/util";

const EMP_LABEL: Record<string, string> = {
  fulltime: "社員", parttime: "アルバイト", contractor: "業務委託", lesson_pro: "レッスンプロ",
};

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const actor = await requireActor("manage_staff");
  const admin = createAdmin();
  const sp = await searchParams;

  const [{ data: stores }, { data: roles }] = await Promise.all([
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
    admin.from("roles").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
  ]);

  if (sp.new !== undefined || sp.edit) {
    let edit: StaffEdit | undefined;
    if (sp.edit) {
      const [{ data: s }, { data: assigns }, { data: role }, { data: wage }] = await Promise.all([
        admin.from("staff").select("*").eq("id", sp.edit).eq("company_id", actor.companyId).single(),
        admin.from("staff_store_assignments").select("store_id, is_primary").eq("staff_id", sp.edit).is("deleted_at", null),
        admin.from("staff_roles").select("role_id").eq("staff_id", sp.edit).is("deleted_at", null).maybeSingle(),
        admin.from("staff_wages").select("hourly_wage, commute_allowance").eq("staff_id", sp.edit).is("deleted_at", null).order("effective_from", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (s) {
        edit = {
          id: s.id, name: s.name, name_kana: s.name_kana, email: s.email, login_id: s.login_id,
          employment_type: s.employment_type, position: s.position,
          store_ids: (assigns ?? []).map((a) => a.store_id),
          primary_store_id: (assigns ?? []).find((a) => a.is_primary)?.store_id ?? null,
          role_id: role?.role_id ?? null,
          hourly_wage: wage?.hourly_wage ?? null,
          commute_allowance: wage?.commute_allowance ?? 0,
        };
      }
    }
    return (
      <>
        <PageTitle>{edit ? `スタッフ編集: ${edit.name}` : "スタッフ追加"}</PageTitle>
        <StaffForm stores={stores ?? []} roles={roles ?? []} edit={edit} />
      </>
    );
  }

  const { data: staffList } = await admin
    .from("staff")
    .select("id, name, email, login_id, employment_type, position, status, staff_store_assignments(store_id, is_primary, stores(name)), staff_roles(roles(name)), staff_wages(hourly_wage, effective_from)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("name");

  return (
    <>
      <PageTitle action={<Link href="/admin/staff?new"><Button>＋ スタッフ追加</Button></Link>}>
        スタッフ管理
      </PageTitle>
      {!staffList?.length ? (
        <Empty>スタッフが登録されていません</Empty>
      ) : (
        <Table headers={["氏名", "主店舗", "雇用形態", "役職", "ロール", "時給", "状態", ""]}>
          {staffList.map((s) => {
            const primary = (s.staff_store_assignments as unknown as { is_primary: boolean; stores: { name: string } | null }[])?.find((a) => a.is_primary);
            const wages = (s.staff_wages as unknown as { hourly_wage: number | null; effective_from: string }[]) ?? [];
            const wage = wages.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
            return (
              <tr key={s.id} className="hover:bg-zinc-50">
                <Td className="font-medium">
                  {s.name}
                  <span className="ml-2 text-xs text-zinc-400">{s.email ?? s.login_id}</span>
                </Td>
                <Td>{primary?.stores?.name ?? "—"}</Td>
                <Td>{EMP_LABEL[s.employment_type]}</Td>
                <Td>{s.position ?? "—"}</Td>
                <Td>{(s.staff_roles as unknown as { roles: { name: string } | null }[])?.[0]?.roles?.name ?? "—"}</Td>
                <Td>{wage?.hourly_wage != null ? yen(wage.hourly_wage) : "—"}</Td>
                <Td>
                  <Badge color={s.status === "active" ? "green" : "zinc"}>
                    {s.status === "active" ? "在籍" : "停止"}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Link href={`/admin/staff?edit=${s.id}`} className="text-sm text-brand hover:underline">編集</Link>
                    <form action={deactivateStaff}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">
                        {s.status === "active" ? "停止" : "再開"}
                      </button>
                    </form>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
