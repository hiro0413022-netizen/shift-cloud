import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Table, Td, Empty } from "@/components/ui";

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ table?: string; page?: string }> }) {
  const actor = await requireActor("view_audit");
  const admin = createAdmin();
  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const per = 50;

  let q = admin
    .from("audit_logs")
    .select("*, staff(name)")
    .eq("company_id", actor.companyId)
    .order("created_at", { ascending: false })
    .range((page - 1) * per, page * per - 1);
  if (sp.table) q = q.eq("table_name", sp.table);
  const { data: logs } = await q;

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
