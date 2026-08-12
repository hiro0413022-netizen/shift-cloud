import { requireActor, isOwner, scopedStoreIds, NO_STORE } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Table, Td, Empty } from "@/components/ui";

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ table?: string; page?: string }> }) {
  const actor = await requireActor("view_audit");
  const admin = createAdmin();
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const per = 50;

  // 店舗スコープ（#134・#128 店舗またぎ廃止）
  // audit_logs は店舗次元を持たない（company_id と操作者しかない）ため、
  // 「オーナー限定にする」か「操作者の配属で絞る」かの二択になる。
  //   → 店長が自店の操作履歴（時給変更・打刻修正など）を追えないと運用が回らないので、後者を採用。
  //   → 副作用として、システム/AI の操作（actor_staff_id が null）は店舗に紐づけようがないため
  //     非オーナーには出ない。全件を見られるのはオーナーだけ。
  const owner = isOwner(actor);
  let actorStaffIds: string[] | null = null;
  if (!owner) {
    const storeIds = await scopedStoreIds(actor);
    const { data: assigns } = await admin
      .from("staff_store_assignments")
      .select("staff_id")
      .eq("company_id", actor.companyId)
      .in("store_id", storeIds)
      .is("deleted_at", null);
    const ids = [...new Set((assigns ?? []).map((a) => a.staff_id))];
    actorStaffIds = ids.length > 0 ? ids : [NO_STORE];
  }

  let q = admin
    .from("audit_logs")
    .select("*, staff(name)")
    .eq("company_id", actor.companyId);
  if (actorStaffIds) q = q.in("actor_staff_id", actorStaffIds);
  if (sp.table) q = q.eq("table_name", sp.table);
  const { data: logs } = await q
    .order("created_at", { ascending: false })
    .range((page - 1) * per, page * per - 1);

  return (
    <>
      <PageTitle>監査ログ</PageTitle>
      {!logs?.length ? (
        <Empty>ログがありません</Empty>
      ) : (
        <Table headers={["日時", "操作者", "アクション", "テーブル", "対象ID"]}>
          {logs.map((l) => (
            <tr key={l.id} className="hover:bg-zinc-50">
              <Td className="whitespace-nowrap text-zinc-500">
                {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "medium" }).format(new Date(l.created_at))}
              </Td>
              <Td>{(l.staff as unknown as { name: string } | null)?.name ?? l.actor_type}</Td>
              <Td className="font-mono text-xs">{l.action}</Td>
              <Td className="font-mono text-xs">{l.table_name}</Td>
              <Td className="font-mono text-xs text-zinc-400">{l.record_id?.slice(0, 8) ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      )}
      <div className="mt-4 flex gap-2 text-sm">
        {page > 1 && <a className="text-brand" href={`/admin/audit-logs?page=${page - 1}`}>← 前へ</a>}
        {logs?.length === per && <a className="text-brand" href={`/admin/audit-logs?page=${page + 1}`}>次へ →</a>}
      </div>
    </>
  );
}
