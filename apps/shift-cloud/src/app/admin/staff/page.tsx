import Link from "next/link";
import { requireActor, visibleStores, isOwner } from "@/lib/auth";
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

  const [stores, { data: roles }] = await Promise.all([
    visibleStores(actor), // オーナー=全店 / それ以外=配属店舗のみ（#128）
    admin.from("roles").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
  ]);

  if (sp.new !== undefined || sp.edit) {
    let edit: StaffEdit | undefined;
    if (sp.edit) {
      const [{ data: s }, { data: assigns }, { data: role }, { data: wage }] = await Promise.all([
        admin.from("staff").select("*").eq("id", sp.edit).eq("company_id", actor.companyId).single(),
        admin.from("staff_store_assignments").select("store_id, is_primary").eq("staff_id", sp.edit).is("deleted_at", null),
        admin.from("staff_roles").select("role_id").eq("staff_id", sp.edit).is("deleted_at", null).maybeSingle(),
        // 最新の賃金行: 同じ日に複数あるときは created_at で決着させる（タイブレーク無しだと古い値が出る）
        admin.from("staff_wages").select("hourly_wage, commute_allowance").eq("staff_id", sp.edit).is("deleted_at", null)
          .order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      // 他店のスタッフはURL直打ちでも編集させない（#134）。
      // 無所属（役員・本部）スタッフを触れるのはオーナーだけ。
      const assignedStoreIds = (assigns ?? []).map((a) => a.store_id);
      const canEdit =
        isOwner(actor) || assignedStoreIds.some((id) => stores.some((st) => st.id === id));
      if (s && canEdit) {
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

  // 一覧は配属店舗で絞る（#134）。
  // 以前は company_id だけだったので、姫路の画面に宝塚のスタッフと **時給** まで出ていた。
  // 非オーナーは staff_store_assignments を !inner にして許可店舗の配属がある人だけに限定する
  // （＝無所属の役員・本部スタッフは出ない。全員を見られるのはオーナーだけ / #128a）。
  const owner = isOwner(actor);
  const assignSelect = owner
    ? "staff_store_assignments(store_id, is_primary, stores(name))"
    : "staff_store_assignments!inner(store_id, is_primary, stores(name))";
  let staffQuery = admin
    .from("staff")
    .select(`id, name, email, login_id, employment_type, position, status, ${assignSelect}, staff_roles(roles(name)), staff_wages(hourly_wage, effective_from, created_at)`)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);
  if (!owner) {
    staffQuery = staffQuery.in(
      "staff_store_assignments.store_id",
      stores.length > 0 ? stores.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  const { data: staffList } = await staffQuery.order("name");

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
            const wages = (s.staff_wages as unknown as { hourly_wage: number | null; effective_from: string; created_at: string }[]) ?? [];
            // 同じ effective_from が並ぶことがあるので created_at でタイブレーク（最後に保存した値を表示）
            const wage = wages.sort(
              (a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at)
            )[0];
            return (
              <tr key={s.id} className="hover:bg-zinc-50">
                <Td className="font-medium">
                  {s.name}
                  {/* 実際にログインに使うID（ログインID優先）。メールは連絡先なので後ろに小さく */}
                  <span className="ml-2 text-xs text-zinc-500">ID: {s.login_id || s.email || "—"}</span>
                  {s.login_id && s.email && <span className="ml-1 text-[10px] text-zinc-300">{s.email}</span>}
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
