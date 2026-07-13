import { requireGenesisActor } from "@/lib/auth";
import { Panel, Badge, Empty, btnCls, btnGhostCls, inputCls, fmtDate } from "@/components/ui";
import {
  getOpenInquiries,
  getRecentHandledInquiries,
  getInquiryStats,
  INQUIRY_TYPE_LABELS,
  INQUIRY_STATUS_LABELS,
  type InquiryType,
} from "@/lib/secretary";
import { approveInquiry, dismissInquiry } from "./actions";

export const dynamic = "force-dynamic";

function typeLabel(t: string) {
  return INQUIRY_TYPE_LABELS[t as InquiryType] ?? t;
}

function fmtEventTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function InboxPage() {
  const actor = await requireGenesisActor();
  const [open, handled, stats] = await Promise.all([
    getOpenInquiries(actor.companyId),
    getRecentHandledInquiries(actor.companyId),
    getInquiryStats(actor.companyId),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">CEO Inbox — 秘書</h1>
        <p className="text-sm text-(--color-dim)">
          問い合わせを確認して返信を承認。返信の送信は承認後に秘書が実行、日程はカレンダーへ自動登録（VISION §7）
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="未対応" value={stats.open} tone={stats.open ? "warn" : "ok"} />
        <Stat label="返信承認待ち" value={stats.awaitingApproval} tone={stats.awaitingApproval ? "warn" : "ok"} />
        <Stat label="本日カレンダー登録" value={stats.scheduledToday} />
        <Stat
          label="種別内訳"
          text={
            Object.keys(stats.byType).length
              ? Object.entries(stats.byType)
                  .map(([t, n]) => `${typeLabel(t)}${n}`)
                  .join(" / ")
              : "—"
          }
        />
      </div>

      <Panel title={`未対応の問い合わせ（${open.length}件）`}>
        {open.length === 0 ? (
          <Empty>未対応の問い合わせはありません</Empty>
        ) : (
          <ul className="space-y-3">
            {open.map((q) => (
              <li key={q.id} className="rounded-lg border border-sky-700/30 bg-(--color-panel-2) p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={q.priority === "high" ? "danger" : "accent"}>{typeLabel(q.inquiry_type)}</Badge>
                  {q.priority === "high" && <Badge tone="danger">優先</Badge>}
                  <span className="text-sm font-medium">{q.from_name ?? q.from_email ?? "（差出人不明）"}</span>
                  {q.subject && <span className="text-xs text-(--color-dim)">／ {q.subject}</span>}
                  <span className="ml-auto text-xs text-(--color-dim)">{q.received_at ? fmtDate(q.received_at) : fmtDate(q.created_at)}</span>
                </div>

                {q.ai_summary && <p className="mt-2 text-sm">{q.ai_summary}</p>}
                {q.snippet && <p className="mt-1 text-xs text-(--color-dim) line-clamp-2">{q.snippet}</p>}

                {q.proposed_event && (
                  <div className="mt-2 rounded-md border border-emerald-700/40 bg-black/20 p-2 text-xs">
                    <span className="text-emerald-300">📅 カレンダー案: </span>
                    {q.proposed_event.title ?? "（無題）"}
                    {q.proposed_event.start ? ` — ${fmtEventTime(q.proposed_event.start)}` : ""}
                    {q.proposed_event.location ? `／${q.proposed_event.location}` : ""}
                    {q.calendar_event_id ? (
                      <span className="ml-1 text-emerald-400">✓登録済</span>
                    ) : (
                      <span className="ml-1 text-(--color-dim)">（自動登録対象）</span>
                    )}
                  </div>
                )}

                <form action={approveInquiry} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={q.id} />
                  <label className="block text-xs text-(--color-dim)">返信案（この文面で送信 / 編集可）</label>
                  <textarea
                    name="reply"
                    rows={5}
                    defaultValue={q.ai_draft_reply ?? ""}
                    placeholder="返信案が未生成です。文面を入力して承認できます。"
                    className={`${inputCls} font-normal`}
                  />
                  <div className="flex gap-2">
                    <button className={btnCls}>承認して送信予約</button>
                    <button className={btnGhostCls} formAction={dismissInquiry}>保留</button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="処理済み（直近20件）">
        {handled.length === 0 ? (
          <Empty>履歴なし</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {handled.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={q.status === "dismissed" ? "default" : "ok"}>
                  {INQUIRY_STATUS_LABELS[q.status] ?? q.status}
                </Badge>
                <span>{q.from_name ?? q.from_email ?? "問い合わせ"}</span>
                {q.subject && <span className="text-xs text-(--color-dim)">／ {q.subject}</span>}
                <span className="ml-auto text-xs text-(--color-dim)">{fmtDate(q.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  text,
  tone,
}: {
  label: string;
  value?: number;
  text?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  const color = tone === "danger" ? "text-red-400" : tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-(--color-txt)";
  return (
    <div className="rounded-lg border border-(--color-line) bg-(--color-panel) p-3">
      <p className="text-xs text-(--color-dim)">{label}</p>
      {text !== undefined ? (
        <p className={`mt-1 text-sm ${color}`}>{text}</p>
      ) : (
        <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      )}
    </div>
  );
}
