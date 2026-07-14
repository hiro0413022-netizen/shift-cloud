import { requireGenesisActor } from "@/lib/auth";
import { Panel, Badge, Empty, btnCls, btnGhostCls, inputCls, fmtDate } from "@/components/ui";
import {
  getOpenInquiries,
  getRecentHandledInquiries,
  getInquiryStats,
  getFilterRules,
  INQUIRY_TYPE_LABELS,
  INQUIRY_STATUS_LABELS,
  type InquiryType,
} from "@/lib/secretary";
import {
  approveInquiry,
  dismissInquiry,
  draftReply,
  draftAllReplies,
  addFilterRule,
  deleteFilterRule,
} from "./actions";

export const dynamic = "force-dynamic";

function typeLabel(t: string) {
  return INQUIRY_TYPE_LABELS[t as InquiryType] ?? t;
}

function channelLabel(source: string) {
  if (source === "line") return "LINE";
  if (source === "gmail") return "メール";
  return source || "その他";
}

function fmtEventTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function InboxPage() {
  const actor = await requireGenesisActor();
  const [open, handled, stats, rules] = await Promise.all([
    getOpenInquiries(actor.companyId), // 受信フィルタ適用後（リッチメニュー押下は入らない）
    getRecentHandledInquiries(actor.companyId),
    getInquiryStats(actor.companyId),
    getFilterRules(actor.companyId),
  ]);

  const noDraft = open.filter((q) => !q.ai_draft_reply).length;
  const filteredTotal = rules.reduce((s, r) => s + (r.hits ?? 0), 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">CEO Inbox — 秘書</h1>
          <p className="text-sm text-(--color-dim)">
            LINE・メールの問い合わせに返信案を用意します。<strong className="text-sky-300">承認を押すと送信</strong>（LINEはn8n、メールは秘書が送信）。
            リッチメニュー押下は対応要件から自動で外れます。
          </p>
        </div>
        <form action={draftAllReplies}>
          <button className={btnCls} disabled={noDraft === 0}>
            返信案をまとめて作る{noDraft > 0 ? `（${noDraft}件）` : ""}
          </button>
        </form>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="未対応（要返信）" value={stats.open} tone={stats.open ? "warn" : "ok"} />
        <Stat label="返信案あり＝承認待ち" value={stats.awaitingApproval} tone={stats.awaitingApproval ? "warn" : "ok"} />
        <Stat label="自動除外（リッチメニュー等）" value={filteredTotal} tone="ok" />
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
                  <Badge tone={q.source === "line" ? "ok" : "default"}>{channelLabel(String(q.source ?? ""))}</Badge>
                  <Badge tone={q.priority === "high" ? "danger" : "accent"}>{typeLabel(q.inquiry_type)}</Badge>
                  {q.priority === "high" && <Badge tone="danger">優先</Badge>}
                  <span className="text-sm font-medium">{q.from_name ?? q.from_email ?? "（差出人不明）"}</span>
                  <span className="ml-auto text-xs text-(--color-dim)">
                    {q.received_at ? fmtDate(q.received_at) : fmtDate(q.created_at)}
                  </span>
                </div>

                {q.ai_summary && <p className="mt-2 text-sm">{q.ai_summary}</p>}
                {q.snippet && <p className="mt-1 text-xs text-(--color-dim)">{q.snippet}</p>}

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
                  <label className="block text-xs text-(--color-dim)">
                    返信案（このまま承認＝送信 / 編集も可）
                    {q.ai_draft_reply ? <span className="ml-1 text-emerald-300">✓ AI作成済み</span> : null}
                  </label>
                  <textarea
                    name="reply"
                    rows={5}
                    defaultValue={q.ai_draft_reply ?? ""}
                    placeholder="返信案は未生成です。［返信案を作る］を押すか、文面を直接書いて承認してください。"
                    className={`${inputCls} font-normal`}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className={btnCls}>承認して{String(q.source) === "line" ? "LINE送信" : "メール送信"}</button>
                    <button className={btnGhostCls} formAction={draftReply}>
                      返信案を作る（AI）
                    </button>
                    <button className={btnGhostCls} formAction={dismissInquiry}>
                      対応不要
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* 受信フィルタ: リッチメニュー押下などを「対応要件」から外す（0045） */}
      <Panel title="対応不要にする文言（受信フィルタ）">
        <p className="mb-3 text-xs text-(--color-dim)">
          LINEのリッチメニューを押すと、その文言がメッセージとして届きます。会員さんは情報を見ているだけなので、
          ここに登録した文言は<strong>対応要件に入りません</strong>（自動で「対応不要」へ）。メニューを増やしたらここに追加してください。
        </p>
        <ul className="mb-3 space-y-1 text-sm">
          {rules.length === 0 ? (
            <Empty>ルールなし</Empty>
          ) : (
            rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md bg-(--color-panel-2) px-2 py-1.5">
                <Badge tone="default">{r.source === "line" ? "LINE" : r.source === "gmail" ? "メール" : "全て"}</Badge>
                <span className="font-medium">{r.pattern}</span>
                <span className="text-xs text-(--color-dim)">
                  {r.match_type === "exact" ? "完全一致" : r.match_type === "prefix" ? "前方一致" : "含む"}
                  {r.label ? ` / ${r.label}` : ""}
                </span>
                <span className="text-xs text-(--color-dim)">除外 {r.hits ?? 0}件</span>
                <form action={deleteFilterRule} className="ml-auto">
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs text-(--color-dim) hover:text-red-300">削除</button>
                </form>
              </li>
            ))
          )}
        </ul>
        <form action={addFilterRule} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className="block text-xs text-(--color-dim)">文言（リッチメニューのボタン名など）</label>
            <input name="pattern" required className={inputCls} placeholder="例: 料金プラン" />
          </div>
          <div>
            <label className="block text-xs text-(--color-dim)">一致条件</label>
            <select name="match_type" className={inputCls} defaultValue="exact">
              <option value="exact">完全一致</option>
              <option value="prefix">前方一致</option>
              <option value="contains">含む</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-(--color-dim)">対象</label>
            <select name="source" className={inputCls} defaultValue="line">
              <option value="line">LINE</option>
              <option value="gmail">メール</option>
              <option value="any">全て</option>
            </select>
          </div>
          <input type="hidden" name="label" value="リッチメニュー" />
          <button className={btnCls}>追加</button>
        </form>
      </Panel>

      <Panel title="処理済み（直近20件）">
        {handled.length === 0 ? (
          <Empty>履歴なし</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {handled.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={q.status === "dismissed" ? "default" : q.status === "replied" ? "ok" : "accent"}>
                  {q.inquiry_type === "noise" ? "自動除外" : (INQUIRY_STATUS_LABELS[q.status] ?? q.status)}
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
  const color =
    tone === "danger"
      ? "text-red-400"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "ok"
          ? "text-emerald-300"
          : "text-(--color-txt)";
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
