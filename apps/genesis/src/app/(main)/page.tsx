import Link from "next/link";
import { requireGenesisActor } from "@/lib/auth";
import {
  getCockpitData,
  computeGenesisScore,
  applyJudgmentPenalties,
  buildJudgmentList,
  getBusinessBreakdown,
} from "@/lib/kernel";
import { runKpiIntegrityChecks } from "@/lib/kpi-checks";
import { runLegalChecks } from "@/lib/legal-checks";
import { getOpenSuggestions, SUGGESTION_KIND_LABELS } from "@/lib/suggestions";
import { countOpenDirectives } from "@/lib/directives";
import { Panel, Badge, StatusDot, Empty, fmtDate, severityTone, KpiCard } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { BusinessBreakdown } from "@/components/business-breakdown";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const actor = await requireGenesisActor();
  const [d, business, suggestions, openDirectives] = await Promise.all([
    getCockpitData(actor.companyId),
    getBusinessBreakdown(actor.companyId),
    getOpenSuggestions(actor.companyId, 5).catch(() => []),
    countOpenDirectives(actor.companyId).catch(() => 0),
  ]);
  // ダッシュボードも日次レポートと同じ判断リスト/スコアを出す（DECISIONS #43）。
  // 以前はここが buildJudgmentList だけで、整合性・法務の警告がトップ画面に出ず、
  // スコアも満点のままだった（レポートとダッシュボードで数字が食い違っていた）。
  const [integrity, legal] = await Promise.all([
    runKpiIntegrityChecks(actor.companyId, d.kpis).catch(() => []),
    runLegalChecks(actor.companyId).catch(() => []),
  ]);
  const judgments = [...integrity, ...legal, ...buildJudgmentList(d)];
  const { score, grade, factors } = applyJudgmentPenalties(computeGenesisScore(d), judgments);

  const openHigh = d.risks.filter((r) => ["high", "critical"].includes(String(r.severity))).length;
  const pendingApprovals = d.approvals.length;

  // 経営で最優先に見るKPI（VISION §6 + ユーザー指定: 売上進捗・会員・入退会）
  const kpiOrder = ["monthly_sales", "members", "conversion_rate", "churn_rate", "trial_bookings", "labor_cost"];
  const kpis = kpiOrder
    .map((code) => d.kpis.find((k) => k.code === code))
    .filter((k): k is NonNullable<typeof k> => k != null);

  const scoreColor = grade === "good" ? "text-emerald-300" : grade === "watch" ? "text-amber-300" : "text-red-300";
  const judgmentIcon = { approval: "✓", blocker: "⛔", risk: "⚠", kpi: "📊" } as const;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide">経営ダッシュボード</h1>
          <p className="text-xs text-(--color-dim)">今日の会社の状態を一目で・事業所ごとに判断する</p>
        </div>
        <Link
          href="/command"
          className="inline-flex items-center gap-2 rounded-lg border border-sky-700/60 bg-(--color-panel) px-3 py-2 text-sm text-sky-200 transition-all hover:scale-[1.02] hover:shadow-[0_0_16px_-4px_rgba(56,189,248,0.6)]"
        >
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          CEO AI に相談
        </Link>
      </div>

      {/* 1段目: 全体スコア + 今日の判断リスト */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="hud reveal flex flex-col justify-between rounded-xl border border-(--color-line) bg-(--color-panel) p-5">
          <p className="text-xs tracking-[0.2em] text-(--color-dim)">今日のYOZAN全体スコア</p>
          <p className={`my-2 text-6xl font-bold tabular-nums ${scoreColor}`}>
            <CountUp value={score} />
            <span className="ml-1 text-xl text-(--color-dim)">点</span>
          </p>
          <div className="space-y-0.5 text-[11px] text-(--color-dim)">
            {factors.length === 0 ? <p>減点要因なし — 順調です</p> : factors.map((f) => <p key={f}>{f}</p>)}
          </div>
          <div className="mt-3 flex gap-2">
            <Badge tone={openHigh > 0 ? "danger" : "default"}>高リスク {openHigh}</Badge>
            <Badge tone={pendingApprovals > 0 ? "accent" : "default"}>承認待ち {pendingApprovals}</Badge>
          </div>
        </div>
        <Panel title={`今日、判断すべきこと（${judgments.length}件）`} className="d1 lg:col-span-2">
          {judgments.length === 0 ? (
            <Empty>判断待ちなし — CEO AIが引き続き監視します</Empty>
          ) : (
            <ol className="space-y-2 text-sm">
              {judgments.slice(0, 7).map((j, i) => (
                <li key={`${j.kind}-${i}`}>
                  <Link href={j.href} className="group flex items-start gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-(--color-panel-2)">
                    <span className="shrink-0">{judgmentIcon[j.kind]}</span>
                    <span>
                      <span className="group-hover:text-sky-300">{j.title}</span>
                      {j.detail && <span className="block text-xs text-(--color-dim)">{j.detail}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* 1.5段目: 改善提案（今週やると効くこと）— 見て終わりにせず、指示にできる（DECISIONS #52） */}
      <Panel
        title={`改善提案 — 今週やると効くこと（${suggestions.length}件）`}
        className="d1"
        action={
          <Link href="/suggestions" className="text-xs text-sky-300 hover:underline">
            すべて見て指示を出す →
          </Link>
        }
      >
        {suggestions.length === 0 ? (
          <Empty>提案なし（日次レポート生成で自動作成されます）</Empty>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className={`rounded-lg border bg-(--color-panel-2) p-3 ${
                  s.severity === "critical"
                    ? "border-red-700/50"
                    : s.severity === "warning"
                      ? "border-amber-700/40"
                      : "border-(--color-line)"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={s.severity === "critical" ? "danger" : s.severity === "warning" ? "warn" : "default"}>
                    {s.severity === "critical" ? "最優先" : s.severity === "warning" ? "推奨" : "余力"}
                  </Badge>
                  <Badge tone="accent">{SUGGESTION_KIND_LABELS[s.kind] ?? s.kind}</Badge>
                  {s.impact && <span className="text-[11px] text-emerald-300">{s.impact}</span>}
                </div>
                <Link href="/suggestions" className="mt-1.5 block text-sm font-medium hover:text-sky-300">
                  {s.title}
                </Link>
                {s.suggested_action && (
                  <p className="mt-1 line-clamp-2 text-xs text-(--color-dim)">{s.suggested_action}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-(--color-line) pt-3 text-xs">
          <Link href="/directives" className="rounded-md border border-sky-800/50 px-2 py-1 text-sky-300 hover:bg-(--color-panel-2)">
            📣 実行指示を出す（未完了 {openDirectives}件）
          </Link>
          <Link href="/inbox" className="rounded-md border border-(--color-line) px-2 py-1 text-(--color-dim) hover:bg-(--color-panel-2)">
            📨 問い合わせに返信を承認する
          </Link>
        </div>
      </Panel>

      {/* 2段目: 経営KPI（会社全体） */}
      <Panel title="経営KPI（会社全体）" className="d1">
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
      </Panel>

      {/* 3段目: 事業別 → 店舗ドリルダウン */}
      <Panel title="事業別パフォーマンス（クリックで店舗別に展開）" className="d2">
        <BusinessBreakdown
          segments={business.segments}
          monthLabel={business.monthLabel}
          forecastMonthLabel={business.forecastMonthLabel}
          forecastTotal={business.forecastTotal}
        />
      </Panel>

      {/* 4段目: アラート/リスク・承認・イベント */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="リスク / ブロッカー" className="d1">
          {d.risks.length === 0 && d.blockers.length === 0 ? (
            <Empty>オープンなリスク・ブロッカーなし</Empty>
          ) : (
            <ul className="space-y-2">
              {d.risks.map((r) => (
                <li key={String(r.id)} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{String(r.title)}</span>
                  <Badge tone={severityTone(String(r.severity))}>{String(r.severity)}</Badge>
                </li>
              ))}
              {d.blockers.map((b) => (
                <li key={String(b.id)} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{String(b.title)}</span>
                  <Badge tone="danger">ブロッカー</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="承認待ち" className="d2">
          {d.approvals.length === 0 ? (
            <Empty>承認待ちなし</Empty>
          ) : (
            <ul className="space-y-2">
              {d.approvals.slice(0, 8).map((a) => (
                <li key={String(a.id)} className="text-sm">
                  <Link href="/approvals" className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-(--color-panel-2)">
                    <span className="truncate">{String(a.title ?? a.kind ?? "承認リクエスト")}</span>
                    <Badge tone="accent">承認待ち</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="最近の動き（社内イベント）" className="d3">
          {d.recentEvents.length === 0 ? (
            <Empty>イベントなし</Empty>
          ) : (
            <ul className="space-y-2">
              {d.recentEvents.slice(0, 8).map((e) => (
                <li key={String(e.id)} className="flex items-start gap-2 text-sm">
                  <StatusDot status={String(e.severity) === "critical" ? "danger" : String(e.severity) === "warning" ? "warning" : "normal"} />
                  <div className="min-w-0">
                    <p className="truncate">{String(e.title)}</p>
                    <p className="text-xs text-(--color-dim)">
                      {fmtDate(String(e.occurred_at))} ・ {String(e.event_type)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
