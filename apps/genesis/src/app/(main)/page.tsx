import Link from "next/link";
import type { ReactNode } from "react";
import { requireGenesisActor, storeScope } from "@/lib/auth";
import {
  getCockpitData,
  computeGenesisScore,
  applyJudgmentPenalties,
  buildJudgmentList,
  alertKey,
  getAckedAlertKeys,
  kpiScopeOf,
  kpiScopeLabel,
} from "@/lib/kernel";
import { runKpiIntegrityChecks } from "@/lib/kpi-checks";
import { runLegalChecks } from "@/lib/legal-checks";
import { getOpenSuggestions } from "@/lib/suggestions";
import { getJudgmentFeed, type JudgmentItem } from "@/lib/judgment-feed";
import { toBriefing, openingLine } from "@/lib/jarvis-pure";
import { jstYmd } from "@/lib/jst";
import { Jarvis } from "@/components/jarvis";
import { Panel, Badge, Empty, fmtDate, KpiCard } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { decideApproval } from "./approvals/actions";
import {
  approveActionForm,
  rejectActionForm,
  cancelActionForm,
  reviseActionAiForm,
  reviseActionEditForm,
} from "./executions/actions";
import { reviewDeliverable } from "./deliverables/actions";
import { approveInquiry } from "./inbox/actions";
import { decideTrialRequest, decideJoinRequest, dismissHotLead, acknowledgeAlert } from "./feed-actions";

export const dynamic = "force-dynamic";

// REDESIGN_2026-07 §3-1: ホーム = スコア＋一言 / 判断フィード（その場で完結） / 5大KPI / AI活動ティッカー
// #182: いちばん上に対話AI（JARVIS）を置き、開いた瞬間に状況を"喋る"面にした。
//       下の見る画面（スコア・判断フィード・KPI・ティッカー）はそのまま残す＝
//       会話が外れたときに必ず戻れる場所を無くさない。
export default async function HomePage() {
  const actor = await requireGenesisActor();
  // #134 店舗またぎ廃止: オーナーは全社（null）、それ以外は自分の配属店舗だけ。
  // ライブラリ側は storeIds を引数で受けるので、cron（actor無し＝全社）は従来どおり動く。
  const scope = storeScope(actor);
  const [d, suggestions, feed, ackedKeys] = await Promise.all([
    getCockpitData(actor.companyId, scope),
    getOpenSuggestions(actor.companyId, 3).catch(() => []),
    getJudgmentFeed(actor.companyId, scope).catch(() => [] as JudgmentItem[]),
    getAckedAlertKeys(actor.companyId).catch(() => new Set<string>()),
  ]);
  const [integrity, legal] = await Promise.all([
    runKpiIntegrityChecks(actor.companyId, d.kpis).catch(() => []),
    runLegalChecks(actor.companyId).catch(() => []),
  ]);
  // approval系はフィード側でカード化するので、アラート一覧からは除外（二重表示防止）
  // 確認済み（#101）はここで除外。値が変わればキーが変わり自動的に再表示される。
  const alerts = [...integrity, ...legal, ...buildJudgmentList(d)]
    .filter((j) => j.kind !== "approval")
    .filter((j) => !ackedKeys.has(alertKey(j)));
  const { score, grade, factors } = applyJudgmentPenalties(computeGenesisScore(d), alerts);

  const undoItems = feed.filter((f) => f.source === "undo");
  const decisionItems = feed.filter((f) => f.source !== "undo");
  const totalDecisions = d.approvals.length + decisionItems.length + alerts.length;

  const kpiOrder = ["monthly_sales", "members", "conversion_rate", "churn_rate", "trial_bookings", "labor_cost"];
  const kpis = kpiOrder
    .map((code) => d.kpis.find((k) => k.code === code))
    .filter((k): k is NonNullable<typeof k> => k != null);
  // #134: kpis に store_id が入る（migration 0112・別作業）までは全KPIが全店合算。
  // 合算を店舗の数字のように見せないため、カードに範囲ラベルを出し、全店合算が混じる時は注記する。
  const hasCompanyWideKpi = kpis.some((k) => kpiScopeOf(k) === "company");

  const scoreColor = grade === "good" ? "text-emerald-300" : grade === "watch" ? "text-amber-300" : "text-red-300";
  const aiEvents = d.recentEvents.filter((e) => String(e.source_type) === "ai").slice(0, 5);
  const ticker = aiEvents.length > 0 ? aiEvents : d.recentEvents.slice(0, 5);

  const summary =
    totalDecisions === 0
      ? "今日の判断はありません。AIが引き続き会社を回しています。"
      : `今日の判断は${totalDecisions}件です。上から順に片づけてください。`;

  // JARVIS が最初に喋る一言。LLMを使わずここで組み立てる＝
  // APIが落ちていても・課金が発生しなくても、開いた瞬間に必ず声が出る。
  const briefing = toBriefing({
    name: actor.name,
    score,
    grade,
    factors,
    approvals: d.approvals.length,
    feed,
    alerts,
    kpis: d.kpis as unknown as Record<string, unknown>[],
    recentEvents: d.recentEvents as unknown as { title: unknown }[],
    today: jstYmd(),
  });

  return (
    <div className="space-y-5">
      {/* 対話AI（#182） */}
      <Jarvis opening={openingLine(briefing)} name={actor.name} />

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
                  <>
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
                    <QueueDetails item={f} />
                  </>
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
                {f.source === "prospect" && f.href && (
                  <a href={f.href} target="_blank" rel="noreferrer" className="btn-main">
                    デモを確認する →
                  </a>
                )}
                {f.source === "reserve" && f.href && (
                  <a href={f.href} target="_blank" rel="noreferrer" className="btn-sub">
                    開いて対応 →
                  </a>
                )}
              </FeedCard>
            ))}

            {/* 整合性・法務・KPIアラート */}
            {alerts.slice(0, 7).map((j, i) => (
              <FeedCard key={`al-${i}`} tag={j.kind === "risk" ? "リスク" : j.kind === "blocker" ? "ブロッカー" : "確認"} title={j.title} detail={j.detail ?? null} href={j.href}>
                <form action={acknowledgeAlert} className="flex gap-2">
                  <input type="hidden" name="key" value={alertKey(j)} />
                  <button className="btn-main">確認した</button>
                </form>
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
      <div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <KpiCard
              key={`${String(k.code)}-${String(k.store_id ?? "all")}`}
              name={String(k.name)}
              value={k.current_value != null ? Number(k.current_value) : null}
              unit={String(k.unit ?? "")}
              trend={k.trend}
              target={k.target_value != null ? Number(k.target_value) : null}
              note={k.notes != null ? String(k.notes) : null}
              scopeLabel={kpiScopeLabel(k)}
            />
          ))}
        </div>
        {/* #134: 体験予約数・入会率は kpis に store_id が無い間、GOLF WING と FRANK の合算になる */}
        {hasCompanyWideKpi && (
          <p className="mt-2 text-[11px] text-(--color-dim)">
            「全店合算」のKPIは GOLF WING と FRANK GOLF を足した数字です（店舗別はまだ取れません）。店舗ごとの内訳は
            <Link href="/finance" className="mx-1 text-sky-300 hover:underline">
              事業別パフォーマンス
            </Link>
            を見てください。
          </p>
        )}
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

/**
 * 承認カードの詳細展開（REDESIGN §3-1 の補強）:
 * 「承認すると何が・誰に・いつ・取り消せるか」＋送信文全文＋修正指示（AI/直接編集）。
 * 修正しても承認待ちのまま。承認して初めて実行される。
 */
function QueueDetails({ item: f }: { item: JudgmentItem }) {
  if (!f.plan && !f.body) return null;
  return (
    <details className="w-full basis-full rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2">
      <summary className="cursor-pointer text-xs text-sky-300 hover:underline">
        詳細 — 承認すると何がどう実行されるか（文面の確認・修正はこちら）
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {f.plan && (
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            <p><span className="text-(--color-dim)">実行内容: </span>{f.plan.what}</p>
            <p><span className="text-(--color-dim)">宛先: </span>{f.plan.target}</p>
            <p><span className="text-(--color-dim)">実行タイミング: </span>{f.plan.timing}</p>
            <p className={f.plan.irreversible ? "text-amber-300" : "text-(--color-dim)"}>
              {f.plan.irreversible ? "⚠ 実行後の取り消しはできません（承認前ならこの画面で修正・却下できます）" : "実行後も社内のみ・外部影響なし"}
            </p>
          </div>
        )}
        {f.body && (
          <div>
            <p className="mb-1 text-xs text-(--color-dim)">送信される文面（全文）:</p>
            <pre className="whitespace-pre-wrap rounded-md border border-(--color-line) bg-(--color-panel-2) p-3 text-xs leading-relaxed">
              {f.body}
            </pre>
          </div>
        )}
        {f.revisable && (
          <div className="grid gap-3 lg:grid-cols-2">
            <form action={reviseActionAiForm} className="space-y-1.5">
              <p className="text-xs text-(--color-dim)">AIに修正指示（例:「値上げの話は入れず、もっと柔らかく」）</p>
              <textarea
                name="instruction"
                rows={2}
                required
                className="w-full rounded-md border border-(--color-line) bg-(--color-panel-2) p-2 text-xs"
                placeholder="どこをどう直すか、一言で"
              />
              <input type="hidden" name="id" value={f.id} />
              <button className="btn-sub">AIに修正させる（指示は学習されます）</button>
            </form>
            <form action={reviseActionEditForm} className="space-y-1.5">
              <p className="text-xs text-(--color-dim)">自分で直接編集（差し替え後も承認するまで送信されません）</p>
              <textarea
                name="body"
                rows={5}
                required
                defaultValue={f.body ?? ""}
                className="w-full rounded-md border border-(--color-line) bg-(--color-panel-2) p-2 text-xs"
              />
              <input
                name="note"
                className="w-full rounded-md border border-(--color-line) bg-(--color-panel-2) p-2 text-xs"
                placeholder="（任意）なぜ直したか — 書くと次回から学習します"
              />
              <input type="hidden" name="id" value={f.id} />
              <button className="btn-sub">この文面に差し替える</button>
            </form>
          </div>
        )}
      </div>
    </details>
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
