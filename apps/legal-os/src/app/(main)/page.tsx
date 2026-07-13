import Link from "next/link";
import { requireLegalActor } from "@/lib/auth";
import { getDashboard, DOC_TYPE_LABELS } from "@/lib/legal";
import { Panel, Badge, Empty } from "@/components/ui";
import { CountUp } from "@/components/count-up";

export const dynamic = "force-dynamic";

function dueTone(days: number | null): "danger" | "warn" | "default" {
  if (days === null) return "default";
  if (days <= 14) return "danger";
  if (days <= 45) return "warn";
  return "default";
}

function fmtDay(d: string | null) {
  if (!d) return "-";
  return new Date(d + "T00:00:00Z").toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function DashboardPage() {
  const actor = await requireLegalActor();
  const db = await getDashboard(actor);

  const stats = [
    { label: "登録契約", value: db.counts.total, tone: "accent" as const },
    { label: "有効", value: db.counts.active, tone: "ok" as const },
    { label: "下書き/レビュー", value: db.counts.drafts, tone: "default" as const },
    { label: "高リスク", value: db.counts.highRisk, tone: "danger" as const },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wide">法務ダッシュボード</h1>
        <Link href="/documents/new" className="text-sm text-sky-400 hover:text-sky-300">
          + 契約を登録
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label}>
            <p className="text-xs text-(--color-dim)">{s.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={s.value} />
            </p>
          </Panel>
        ))}
      </div>

      <Panel title="期限が近い契約（90日以内）">
        {db.upcoming.length === 0 ? (
          <Empty>90日以内に対応期限の来る契約はありません</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {db.upcoming.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/documents/${d.id}`} className="truncate font-medium hover:text-sky-300">
                    {d.title}
                  </Link>
                  <p className="text-xs text-(--color-dim)">
                    {DOC_TYPE_LABELS[d.doc_type]}
                    {d.counterparty ? ` ・ ${d.counterparty}` : ""} ・ 期日 {fmtDay(d.next_action_date ?? d.expiry_date)}
                  </p>
                </div>
                <Badge tone={dueTone(d.days)}>
                  {d.days !== null ? `あと${d.days}日` : "-"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="自動更新が近い契約">
          {db.autoRenew.length === 0 ? (
            <Empty>該当なし</Empty>
          ) : (
            <ul className="space-y-2">
              {db.autoRenew.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/documents/${d.id}`} className="truncate hover:text-sky-300">
                    {d.title}
                  </Link>
                  <Badge tone={dueTone(d.days)}>{d.days !== null ? `あと${d.days}日` : "-"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="高リスク契約">
          {db.highRisk.length === 0 ? (
            <Empty>該当なし</Empty>
          ) : (
            <ul className="space-y-2">
              {db.highRisk.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/documents/${d.id}`} className="truncate hover:text-sky-300">
                    {d.title}
                  </Link>
                  <Badge tone="danger">高</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
