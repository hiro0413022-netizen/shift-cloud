import Link from "next/link";
import type { ReactNode } from "react";
import { requireGenesisActor } from "@/lib/auth";
import { getCockpitData, computeGenesisScore, applyJudgmentPenalties, buildJudgmentList } from "@/lib/kernel";
import { runKpiIntegrityChecks } from "@/lib/kpi-checks";
import { runLegalChecks } from "@/lib/legal-checks";
import { getOpenSuggestions } from "@/lib/suggestions";
import { getJudgmentFeed, type JudgmentItem } from "@/lib/judgment-feed";
import { Panel, Badge, Empty, fmtDate, KpiCard } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { decideApproval } from "./approvals/actions";
import { approveActionForm, rejectActionForm, cancelActionForm } from "./executions/actions";
import { reviewDeliverable } from "./deliverables/actions";
import { approveInquiry } from "./inbox/actions";
import { decideTrialRequest, decideJoinRequest, dismissHotLead } from "./feed-actions";

export const dynamic = "force-dynamic";

// REDESIGN_2026-07 §3-1: ホーム = スコア＋一言 / 判断フィード（その場で完結） / 5大KPI / AI活動ティッカー
export default async function HomePage() {
  const actor = await requireGenesisActor();
  const [d, suggestions, feed] = await Promise.all([
    getCockpitData(actor.companyId),
    getOpenSuggestions(actor.companyId, 3).catch(() => []),
    getJudgmentFeed(actor.companyId).catch(() => [] as JudgmentItem[]),
  ]);
  const [integrity, legal] = await Promise.all([
    runKpiIntegrityChecks(actor.companyId, d.kpis).catch(() => []),
    runLegalChecks(actor.companyId).catch(() => []),
  ]);
  // approval系はフィード側でカード化するので、アラート一覧からは除外（二重表示防止）
  const alerts = [...integrity, ...legal, ...buildJudgmentList(d)].filter((j) => j.kind !== "approval");
  const { score, grade, factors } = applyJudgmentPenalties(computeGenesisScore(d), alerts);

  const undoItems = feed.filter((f) => f.source === "undo");
  const decisionItems = feed.filter((f) => f.source !== "undo");
  const totalDecisions = d.approvals.length + decisionItems.length + alerts.length;

  const kpiOrder = ["monthly_sales", "members", "conversion_rate", "churn_rate", "trial_bookings", "labor_cost"];
  const kpis = kpiOrder
    .map((code) => d.kpis.find((k) => k.code === code))
    .filter((k): k is NonNullable<typeof k> => k != null);

  const scoreColor = grade === "good" ? "text-emerald-300" : grade === "watch" ? "text-amber-300" : "text-red-300";
  const aiEvents = d.recentEvents.filter((e) => String(e.source_type) === "ai").slice(0, 5);
  const ticker = aiEvents.length > 0 ? aiEvents : d.recentEvents.slice(0, 5);

  const summary =
    totalDecisions === 0
      ? "今日の判断はありません。AIが引き続き会社を回しています。"
      : `今日の判断は${totalDecisions}件です。上から順に片づけてください。`;

  return (
    <div className="space-y-5">
      {/* スコア＋一言 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[11px] text-(--color-dim)">全体スコア</p>
            <p className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
              <CountUp value={score} />
            </p>
          </div>
          <div className="border-l border-(--color-line) pl-4 text-sm">
            <p>{summary}</p>
            <p className="text-xs text-(--color-dim)">{factors.length === 0 ? "減点要因なし" : factors.join(" ・ ")}</p>
          </div>
        </div>
        <Link
          href="/command"
          className="rounded-lg border border-sky-700/60 bg-(--color-panel-2) px-3 py-2 text-sm text-sky-200 hover:bg-(--color-panel)"
        >
          CEO AIに相談
        </Link>
      </div>

      {/* 実行予定（取消枠） */}
      {undoItems.length > 0 && (
        <div className="space-y-2">
          {undoItems.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-700/40 bg-(--color-panel) px-4 py-2.5 text-sm"
            >
              <Badge tone="warn">{f.tag}</Badge>
              <span className="min-w-0 flex-1 truncate">{f.title}</span>
              <span className="text-xs text-(--color-dim)">
                実行予定 {f.scheduledAt ? fmtDate(f.scheduledAt) : "まもなく"}
              </span>
              <form action={cancelActionForm}>
                <input type="hidden" name="id" value={f.id} />
                <button className="rounded-md border border-(--color-line) px-3 py-1.5 text-xs hover:bg-(--color-panel-2)">
                  取り消す
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* 判断フィード */}
      <Panel title={`今日の判断（${totalDecisions}件）`}>
        {totalDecisions === 0 ? (
          <div className="py-6 text-center text-sm text-(--color-dim)">
            <p className="text-base">判断ゼロ — いい日です。</p>
            <p className="mt-2">AIの直近の動きは下のティッカーへ。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 承認リクエスト */}
            {d.approvals.map((a) => (
              <FeedCard key={`ap-${String(a.id)}`} tag="承認" title={String(a.title ?? a.kind ?? "承認リクエスト")} detail={null} href="/approvals">
                <form action={decideApproval} className="flex gap-2">
                  <input type="hidden" name="id" value={String(a.id)} />
                  <button name="decision" value="rejected" className="btn-sub">却下</button>
                  <button name="decision" value="approved" className="btn-main">承認</button>
                </form>
              </FeedCard>
            ))}

            {/* 統合フィード */}
            {decisionItems.map((f) => (
              <FeedCard key={`${f.source}-${f.id}`} tag={f.tag} title={f.title} detail={f.detail} href={f.href} stale={f.stale}>
                {f.source === "queue" && (
                  <div className="flex gap-2">
                    <form action={rejectActionForm}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="btn-sub">却下</button>
                    </form>
                    <form action={approveActionForm}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="btn-main">承認して実行</button>
                    </form>
                  </div>
                )}
                {f.source === "deliverable" && (
                  <form action={reviewDeliverable} className="flex gap-2">
                    <input type="hidden" name="id" value={f.id} />
                    <button name="decision" value="rejected" className="btn-sub">却下</button>
                    <button name="decision" value="approved" className="btn-main">承認</button>
                  </form>
                )}
                {f.source === "inquiry" &&
                  (f.hasDraft ? (
                    <form action={approveInquiry}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="btn-main">下書きを承認して送信</button>
                    </form>
                  ) : (
                    <Link href="/inbox" className="btn-sub">下書きを作る</Link>
                  ))}
                {f.source === "trial" && (
                  <form action={decideTrialRequest} className="flex gap-2">
                    <input type="hidden" name="id" value={f.id} />
                    <button name="decision" value="canceled" className="btn-sub">キャンセル</button>
                    <button name="decision" value="confirmed" className="btn-main">日程を確定</button>
                  </form>
                )}
                {f.source === "join" && (
                  <form action={decideJoinRequest} className="flex gap-2">
                    <input type="hidden" name="id" value={f.id} />
                    <button name="decision" value="rejected" className="btn-sub">却下</button>
                    <button name="decision" value="approved" className="btn-main">承認して会員番号発行</button>
                  </form>
                )}
                {f.source === "hotlead" && (
                  <div className="flex gap-2">
                    <form action={dismissHotLead}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="btn-sub">対応した</button>
                    </form>
                    {f.href && (
                      <a href={f.href} target="_blank" rel="noreferrer" className="btn-main">
                        営業先を開いて架電 →
                      </a>
                    )}
                  </div>
                )}
                {f.source === "reserve" && f.href && (
                  <a href={f.href} target="_blank" rel="noreferrer" className="btn-sub">
                    開いて対応 →
                  </a>
                )}
              </FeedCard>
            ))}

            {/* 整合性・法務・KPIアラート（リンク型） */}
            {alerts.slice(0, 7).map((j, i) => (
              <FeedCard key={`al-${i}`} tag={j.kind === "risk" ? "リスク" : j.kind === "blocker" ? "ブロッカー" : "確認"} title={j.title} detail={j.detail ?? null} href={j.href}>
                <Link href={j.href} className="btn-sub">確認する →</Link>
              </FeedCard>
            ))}

            {/* 改善提案（発行判断は /suggestions で） */}
            {suggestions.map((sg) => (
              <FeedCard key={`sg-${sg.id}`} tag="改善提案" title={sg.title} detail={sg.impact ?? sg.suggested_action ?? null} href="/suggestions">
                <Link href="/suggestions" className="btn-sub">工程にして指示 →</Link>
              </FeedCard>
            ))}
          </div>
        )}
      </Panel>

      {/* 5大KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard
            key={String(k.code)}
            name={String(k.name)}
            value={k.current_value != null ? Number(k.current_value) : null}
            unit={String(k.unit ?? "")}
            trend={k.trend}
            target={k.target_value != null ? Number(k.target_value) : null}
            note={k.notes != null ? String(k.notes) : null}
          />
        ))}
      </div>

      {/* AI活動ティッカー */}
      <Panel title="AIの動き" action={<Link href="/agents" className="text-xs text-sky-300 hover:underline">AI社員を見る →</Link>}>
        {ticker.length === 0 ? (
          <Empty>直近の活動なし</Empty>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {ticker.map((e) => (
              <li key={String(e.id)} className="flex items-start gap-2">
                <span className="shrink-0 text-xs text-(--color-dim)">{fmtDate(String(e.occurred_at))}</span>
                <span className="min-w-0 truncate">{String(e.title)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function FeedCard({
  tag,
  title,
  detail,
  href,
  stale,
  children,
}: {
  tag: string;
  title: string;
  detail: string | null;
  href: string | null;
  stale?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
        stale ? "border-amber-700/50 bg-(--color-panel-2)" : "border-(--color-line) bg-(--color-panel-2)"
      }`}
    >
      <Badge tone="accent">{tag}</Badge>
      {stale && <Badge tone="warn">24時間経過</Badge>}
      <div className="min-w-[180px] flex-1">
        <p className="text-sm">{title}</p>
        {detail && <p className="mt-0.5 line-clamp-2 text-xs text-(--color-dim)">{detail}</p>}
        {href &&
          (href.startsWith("http") ? (
            <a href={href} target="_blank" rel="noreferrer" className="text-xs text-sky-300 hover:underline">
              詳細を見る
            </a>
          ) : (
            <Link href={href} className="text-xs text-sky-300 hover:underline">
              詳細を見る
            </Link>
          ))}
      </div>
      {children}
    </div>
  );
}
