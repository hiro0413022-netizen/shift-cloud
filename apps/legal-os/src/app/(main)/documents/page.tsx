import Link from "next/link";
import { requireLegalActor } from "@/lib/auth";
import { listDocuments, DOC_TYPE_LABELS, STATUS_LABELS } from "@/lib/legal";
import { Panel, Badge, Empty, StatusDot } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmtDay(d: string | null) {
  if (!d) return "-";
  return new Date(d + "T00:00:00Z").toLocaleDateString("ja-JP", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; doc_type?: string; q?: string }>;
}) {
  const actor = await requireLegalActor();
  const sp = await searchParams;
  const docs = await listDocuments(actor, {
    status: sp.status,
    docType: sp.doc_type,
    q: sp.q,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wide">契約一覧</h1>
        {actor.canWrite && (
          <Link href="/documents/new" className="text-sm text-sky-400 hover:text-sky-300">
            + 登録
          </Link>
        )}
      </div>

      <Panel>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-[--color-dim]">検索</span>
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="件名・相手方"
              className="rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-1.5"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[--color-dim]">種別</span>
            <select
              name="doc_type"
              defaultValue={sp.doc_type ?? ""}
              className="rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-1.5"
            >
              <option value="">すべて</option>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[--color-dim]">状態</span>
            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className="rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-1.5"
            >
              <option value="">すべて</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <button className="rounded-lg border border-[--color-line] px-3 py-1.5 text-[--color-dim] hover:text-[--color-txt]">
            絞り込み
          </button>
        </form>
      </Panel>

      <Panel>
        {docs.length === 0 ? (
          <Empty>契約がありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[--color-dim]">
                  <th className="py-2 pr-3 font-medium">件名</th>
                  <th className="py-2 pr-3 font-medium">種別</th>
                  <th className="py-2 pr-3 font-medium">相手方</th>
                  <th className="py-2 pr-3 font-medium">状態</th>
                  <th className="py-2 pr-3 font-medium">対応期日</th>
                  <th className="py-2 pr-3 font-medium">満了</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-t border-[--color-line] hover:bg-[--color-panel-2]/50">
                    <td className="py-2.5 pr-3">
                      <Link href={`/documents/${d.id}`} className="font-medium hover:text-sky-300">
                        {d.title}
                      </Link>
                      {d.risk_level === "high" && (
                        <Badge tone="danger"><span className="ml-1">高リスク</span></Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-[--color-dim]">{DOC_TYPE_LABELS[d.doc_type]}</td>
                    <td className="py-2.5 pr-3 text-[--color-dim]">{d.counterparty ?? "-"}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={d.status} />
                        {STATUS_LABELS[d.status] ?? d.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{fmtDay(d.next_action_date)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-[--color-dim]">{fmtDay(d.expiry_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
