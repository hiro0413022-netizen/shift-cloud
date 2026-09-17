import Link from "next/link";
import { requireGenesisActor, storeScope } from "@/lib/auth";
import { getHomeData, isMonthlyCheckDay } from "@/lib/todo";
import { getDrill, isDrillMetric } from "@/lib/drilldown";
import { kpiScopeLabel } from "@/lib/kernel";
import { toBriefing, openingLine } from "@/lib/jarvis-pure";
import { jstYmd } from "@/lib/jst";
import { parsePanelKey, remainingPerDay, drillMetricOfKpi } from "@/lib/home-pure";
import { Jarvis } from "@/components/jarvis";
import { KpiCard, fmtDate, Badge } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { StalledBand } from "@/components/home/stalled-band";
import { ChangesLine } from "@/components/home/changes-line";
import { TodoList, TodoPanel, ClearAiButton, OldLineButton } from "@/components/home/todo";
import { DrillPanel } from "@/components/home/drill-panel";
import { TodoHotkeys } from "@/components/home/todo-hotkeys";
import { SystemCards } from "@/components/home/system-cards";
import { getSystemCards } from "@/lib/system-links";
import { cancelActionForm } from "./executions/actions";

export const dynamic = "force-dynamic";

/*
  ホーム（DECISIONS #244・2026-09-15 UI大幅改修）
  ユーザー指摘「すごく見にくい」「必要な情報を取りに行くのに手間がかかる」への答え。
  上から: GENESISに聞く（1行）→ ① 止まっているもの → ② 前回からの変化 →
          左: 今日やること（③ 右パネルで完結・⑥ キーボード） 右: 今月の数字（④ 1日あたり・⑦ 押すと深掘り）
  右パネルは URL（?panel= / ?drill=）で開く＝サーバーで描く・戻るで閉じる・JARVIS（声）からも開ける。
  REDESIGN_2026-07 §3-1 の「1カード=1判断」「数字は画面が計算した値だけを喋る」は変えていない。
*/
type SP = { panel?: string; next?: string; drill?: string; store?: string; kind?: string; alias?: string; checks?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireGenesisActor();
  const sp = await searchParams;
  const [home, systemCards] = await Promise.all([getHomeData(actor, { includeChecks: sp.checks === "1" }), getSystemCards(actor)]);
  const { cockpit: d, score, todos, undo, stalled, checks } = home;
  const showChecksLine = !sp.checks && !isMonthlyCheckDay() && checks.length > 0;

  const kpiOrder = ["monthly_sales", "members", "conversion_rate", "churn_rate", "trial_bookings", "labor_cost"];
  const kpis = kpiOrder.map((code) => d.kpis.find((k) => k.code === code)).filter((k): k is NonNullable<typeof k> => k != null);
  const today = jstYmd();

  const briefing = toBriefing({
    name: actor.name,
    score: score.score,
    grade: score.grade,
    factors: score.factors,
    approvals: d.approvals.length,
    feed: home.feed,
    alerts: home.alerts,
    kpis: d.kpis as unknown as Record<string, unknown>[],
    recentEvents: d.recentEvents as unknown as { title: unknown }[],
    today,
  });

  // 右パネル（③）。?panel=first は JARVIS（声）用＝いちばん上の件
  const panelParam = sp.panel === "first" ? todos[0]?.key : sp.panel;
  const panel = parsePanelKey(panelParam);
  const panelIndex = panel ? todos.findIndex((t) => t.key === panelParam) : -1;
  const panelEntry = panelIndex >= 0 ? todos[panelIndex] : null;
  const nextKey = panelIndex >= 0 ? todos[panelIndex + 1]?.key ?? null : sp.next && todos.some((t) => t.key === sp.next) ? sp.next : null;
  const nextHref = nextKey ? `/?panel=${encodeURIComponent(nextKey)}` : null;

  // 深掘りパネル（⑦）
  // ?alias=frank|gw は JARVIS（声）用の店舗の別名。実IDは getDrill が直す
  const drill = isDrillMetric(sp.drill)
    ? await getDrill(actor.companyId, storeScope(actor), sp.drill, sp.store ?? (sp.alias ? `alias:${sp.alias}` : null), sp.kind ?? null).catch(() => null)
    : null;

  const aiEvents = d.recentEvents.filter((e) => String(e.source_type) === "ai").slice(0, 3);
  const ticker = aiEvents.length > 0 ? aiEvents : d.recentEvents.slice(0, 3);
  const scoreColor = score.grade === "good" ? "text-emerald-300" : score.grade === "watch" ? "text-amber-300" : "text-red-300";
  const dateLabel = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="space-y-4">
      {/* 上段: 挨拶＋GENESISに聞く（声は最初オフ・#244） */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="shrink-0">
          <p className="text-sm text-(--color-dim)">{dateLabel}</p>
          <h1 className="text-2xl font-bold leading-tight md:text-[26px]">{openingLine(briefing).split("。")[0]}</h1>
        </div>
        <div className="min-w-0 flex-1">
          <Jarvis opening={openingLine(briefing)} name={actor.name} />
        </div>
      </div>

      {/* ① 止まっているもの */}
      <StalledBand items={stalled} />

      {/* ② 前回からの変化 */}
      <ChangesLine />

      {/* 実行予定（取消枠）はそのまま最上段近くに */}
      {undo.length > 0 && (
        <div className="space-y-2">
          {undo.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-700/40 bg-(--color-panel) px-4 py-2.5 text-sm">
              <Badge tone="warn">{f.tag}</Badge>
              <span className="min-w-0 flex-1 truncate">{f.title}</span>
              <span className="text-xs text-(--color-dim)">実行予定 {f.scheduledAt ? fmtDate(f.scheduledAt) : "まもなく"}</span>
              <form action={cancelActionForm}>
                <input type="hidden" name="id" value={f.id} />
                <button className="btn-sub">取り消す</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* 今日やること（③⑥） */}
        <section className="flex flex-col rounded-xl border border-(--color-line) bg-(--color-panel)">
          <div className="flex flex-wrap items-baseline gap-3 px-4 py-3 md:px-5">
            <h2 className="text-lg font-bold">今日やること</h2>
            <span className={`tnum text-[15px] font-bold ${todos.length ? "text-(--color-danger)" : "text-(--color-ok)"}`}>{todos.length}件</span>
            <span className="ml-auto hidden text-xs text-(--color-faint) md:inline">↑↓で選ぶ ・ Enterで開く ・ Aで承認</span>
            <OldLineButton todos={todos} now={Date.now()} />
            <ClearAiButton todos={todos} />
            <span className="text-xs text-(--color-faint)">
              スコア <b className={scoreColor}><CountUp value={score.score} /></b>
              {score.factors.length > 0 && <span className="ml-1">（{score.factors.join("・")}）</span>}
            </span>
          </div>
          <TodoList todos={todos} />
          {showChecksLine && (
            <p className="border-t border-(--color-line) px-4 py-2.5 text-xs text-(--color-dim) md:px-5">
              データの点検・改善提案 {checks.length}件は毎月1〜3日にここへ出ます。
              <Link href="/?checks=1" className="ml-2 text-(--color-accent) hover:underline">今すぐ見る</Link>
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-(--color-line) bg-(--color-bg)/60 px-4 py-2.5 text-xs text-(--color-dim) md:px-5">
            <span className="font-bold text-(--color-txt)">AIの動き</span>
            {ticker.length === 0 ? (
              <span>直近の活動なし</span>
            ) : (
              ticker.map((e) => (
                <span key={String(e.id)} className="truncate">
                  {fmtDate(String(e.occurred_at))} {String(e.title)}
                </span>
              ))
            )}
            <Link href="/agents" className="ml-auto text-(--color-accent) hover:underline">すべて見る</Link>
          </div>
        </section>

        {/* 今月の数字（④⑦） */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">今月の数字</h2>
            <span className="ml-auto text-xs text-(--color-faint)">押すと 店舗 → 種別 → 人 まで見られます</span>
          </div>
          <div className="kpi-scroll md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-2">
            {kpis.map((k) => {
              const metric = drillMetricOfKpi(String(k.code));
              const value = k.current_value != null ? Number(k.current_value) : null;
              const target = k.target_value != null ? Number(k.target_value) : null;
              const unit = String(k.unit ?? "");
              const perDay = remainingPerDay({ code: String(k.code), value, target, unit, today });
              const card = (
                <KpiCard
                  name={String(k.name)}
                  value={value}
                  unit={unit}
                  trend={k.trend}
                  target={target}
                  note={k.notes != null ? String(k.notes) : null}
                  sub={perDay}
                  scopeLabel={kpiScopeLabel(k)}
                />
              );
              return metric ? (
                <Link key={String(k.code)} href={`/?drill=${metric}`} className="block">
                  {card}
                </Link>
              ) : (
                <div key={String(k.code)}>{card}</div>
              );
            })}
          </div>
          <Link href="/finance" className="inline-flex items-center gap-1 text-sm font-bold text-(--color-accent) hover:underline">
            事業別の内訳を見る →
          </Link>
        </section>
      </div>

      {/* システムへ直行（#248・GOLF WING 店舗ダッシュボード下のカードと同じ形） */}
      <SystemCards cards={systemCards} />

      {/* パネル */}
      {panel && (
        <TodoPanel
          entry={panelEntry}
          index={panelIndex}
          total={todos.length}
          next={nextHref}
          closeHref="/"
          sameKind={panelEntry ? todos.filter((t) => t.source === panelEntry.source) : []}
        />
      )}
      {drill && <DrillPanel level={drill} closeHref="/" />}
      <TodoHotkeys enabled={!panel && !drill} />
    </div>
  );
}
