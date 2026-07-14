import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLegalActor } from "@/lib/auth";
import { getDocument, DOC_TYPE_LABELS, STATUS_LABELS, RISK_LABELS } from "@/lib/legal";
import { setStatusAction } from "../actions";
import { Panel, Badge, StatusDot, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmtDay(d: string | null) {
  if (!d) return "-";
  return new Date(d + "T00:00:00Z").toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtSize(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const REMINDER_LABELS: Record<string, string> = {
  renewal: "更新",
  termination_notice: "解約通知期限",
  expiry: "満了",
  custom: "その他",
};

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireLegalActor();
  const { id } = await params;
  const result = await getDocument(actor, id);
  if (!result) notFound();
  const { doc, files, reminders } = result;

  const rows: Array<[string, string]> = [
    ["種別", DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type],
    ["相手方", doc.counterparty ?? "-"],
    ["契約開始", fmtDay(doc.effective_date)],
    ["契約満了", fmtDay(doc.expiry_date)],
    ["自動更新", doc.auto_renew ? "あり" : "なし"],
    ["解約通知期限日数", doc.renewal_notice_days != null ? `${doc.renewal_notice_days}日前` : "-"],
    ["対応期日", fmtDay(doc.next_action_date)],
    ["契約金額", doc.amount != null ? `${doc.amount.toLocaleString("ja-JP")} ${doc.currency}` : "-"],
    ["リスク", doc.risk_level ? RISK_LABELS[doc.risk_level] : "未評価"],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/documents" className="text-xs text-(--color-dim) hover:text-(--color-txt)">← 一覧へ</Link>
          <h1 className="mt-1 truncate text-lg font-bold tracking-wide">{doc.title}</h1>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm">
          <StatusDot status={doc.status} />
          {STATUS_LABELS[doc.status] ?? doc.status}
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="契約情報">
          <dl className="divide-y divide-(--color-line) text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-2">
                <dt className="text-(--color-dim)">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="space-y-5">
          <Panel title="要点 / メモ">
            {doc.summary ? (
              <p className="whitespace-pre-wrap text-sm">{doc.summary}</p>
            ) : (
              <Empty>要点は未入力です（フェーズ2でlegal_aiが自動抽出）</Empty>
            )}
          </Panel>

          <Panel title="期限リマインダー">
            {reminders.length === 0 ? (
              <Empty>設定なし</Empty>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {reminders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="text-(--color-dim)">{REMINDER_LABELS[r.kind] ?? r.kind}</span>
                    <span className="tabular-nums">{fmtDay(r.due_date)}（{r.lead_days}日前通知）</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="ファイル">
        {files.length === 0 ? (
          <Empty>ファイルはありません</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <a
                    href={`/api/file/${f.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sky-400 hover:text-sky-300"
                  >
                    {f.file_name}
                  </a>
                  <span className="ml-2 text-xs text-(--color-dim)">{fmtSize(f.size_bytes)}</span>
                </div>
                <Badge>{f.kind}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {actor.canManage && (
        <Panel title="ステータス変更（管理者）">
          <form action={setStatusAction} className="flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="id" value={doc.id} />
            <label className="block">
              <span className="mb-1 block text-xs text-(--color-dim)">新しい状態</span>
              <select name="status" defaultValue={doc.status} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-1.5">
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <button className="rounded-lg bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-500">更新</button>
            <p className="w-full text-xs text-(--color-dim)">
              ※ 締結・更新・解約の正式承認はGENESIS側（approval_requests）で古川さんが実施します。
            </p>
          </form>
        </Panel>
      )}
    </div>
  );
}
