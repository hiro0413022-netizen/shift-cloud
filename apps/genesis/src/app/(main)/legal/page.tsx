import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, StatusDot } from "@/components/ui";
import { CountUp } from "@/components/count-up";

export const dynamic = "force-dynamic";

// Legal OSは独立アプリ。Genesisは閲覧のみ（入力・登録はLegal OS側、DECISIONS #30）。
const LEGAL_OS_URL = process.env.NEXT_PUBLIC_LEGAL_OS_URL ?? "https://legal-os-peach.vercel.app";

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "契約書",
  agreement: "覚書・MOU",
  terms: "規約",
  nda: "NDA",
  other: "その他",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  under_review: "AIレビュー中",
  pending_approval: "承認待ち",
  active: "有効",
  expired: "満了",
  terminated: "解約済",
  archived: "アーカイブ",
};

type Doc = {
  id: string;
  doc_type: string;
  title: string;
  counterparty: string | null;
  status: string;
  expiry_date: string | null;
  next_action_date: string | null;
  auto_renew: boolean;
  risk_level: string | null;
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(date + "T00:00:00Z");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
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
function dueTone(days: number | null): "danger" | "warn" | "default" {
  if (days === null) return "default";
  if (days <= 14) return "danger";
  if (days <= 45) return "warn";
  return "default";
}

export default async function LegalPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const { data } = await admin
    .from("leg_documents")
    .select("id, doc_type, title, counterparty, status, expiry_date, next_action_date, auto_renew, risk_level")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .limit(1000);
  const docs = (data ?? []) as Doc[];

  const active = docs.filter((d) => d.status === "active");
  const pendingApproval = docs.filter((d) => d.status === "pending_approval");
  const highRisk = active.filter((d) => d.risk_level === "high");

  const withDays = (list: Doc[]) =>
    list
      .map((d) => ({ ...d, days: daysUntil(d.next_action_date ?? d.expiry_date) }))
      .filter((d) => d.days !== null && d.days <= 90)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  const upcoming = withDays(active);
  const autoRenew = withDays(active.filter((d) => d.auto_renew));

  const stats = [
    { label: "登録契約", value: docs.length },
    { label: "有効", value: active.length },
    { label: "90日以内に期限", value: upcoming.length },
    { label: "高リスク", value: highRisk.length },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-wide">契約・法務（Legal OS）</h1>
          <p className="text-xs text-(--color-dim)">
            登録・編集は独立アプリ Legal OS で。ここは閲覧専用です。
          </p>
        </div>
        <a
          href={LEGAL_OS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white transition-colors hover:bg-sky-500"
        >
          Legal OSを開く ↗
        </a>
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

      {pendingApproval.length > 0 && (
        <Panel title="承認待ち（締結・更新・解約）">
          <ul className="divide-y divide-(--color-line)">
            {pendingApproval.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <a
                  href={`${LEGAL_OS_URL}/documents/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium hover:text-sky-300"
                >
                  {d.title}
                </a>
                <Badge tone="accent">承認待ち</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="期限が近い契約（90日以内）">
        {upcoming.length === 0 ? (
          <Empty>90日以内に対応期限の来る契約はありません</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {upcoming.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <a
                    href={`${LEGAL_OS_URL}/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium hover:text-sky-300"
                  >
                    {d.title}
                  </a>
                  <p className="text-xs text-(--color-dim)">
                    {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                    {d.counterparty ? ` ・ ${d.counterparty}` : ""} ・ 期日 {fmtDay(d.next_action_date ?? d.expiry_date)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d.auto_renew && <Badge tone="warn">自動更新</Badge>}
                  <Badge tone={dueTone(d.days)}>{d.days !== null ? `あと${d.days}日` : "-"}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="自動更新が近い契約">
          {autoRenew.length === 0 ? (
            <Empty>該当なし</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {autoRenew.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <a
                    href={`${LEGAL_OS_URL}/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:text-sky-300"
                  >
                    {d.title}
                  </a>
                  <Badge tone={dueTone(d.days)}>{d.days !== null ? `あと${d.days}日` : "-"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="高リスク契約">
          {highRisk.length === 0 ? (
            <Empty>該当なし</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {highRisk.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <a
                    href={`${LEGAL_OS_URL}/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:text-sky-300"
                  >
                    {d.title}
                  </a>
                  <span className="flex items-center gap-1.5">
                    <StatusDot status={d.status} />
                    {STATUS_LABELS[d.status] ?? d.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
