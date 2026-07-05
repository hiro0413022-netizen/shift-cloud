import Link from "next/link";
import { requireGenesisActor } from "@/lib/auth";
import { getCockpitData, computeGenesisScore, buildJudgmentList } from "@/lib/kernel";
import { Panel, Badge, StatusDot, Empty, fmtDate, severityTone, KpiCard } from "@/components/ui";
import { CountUp } from "@/components/count-up";

export const dynamic = "force-dynamic";

type Node = {
  key: string;
  label: string;
  href: string;
  state: "normal" | "active" | "processing" | "warning" | "danger" | "completed" | "approval_required";
  detail: string;
};

export default async function CockpitPage() {
  const actor = await requireGenesisActor();
  const d = await getCockpitData(actor.companyId);
  const { score, grade, factors } = computeGenesisScore(d);
  const judgments = buildJudgmentList(d);

  const openHigh = d.risks.filter((r) => ["high", "critical"].includes(String(r.severity))).length;
  const pendingApprovals = d.approvals.length;
  const activeDev = d.devStatuses.filter((s) => s.status === "active").length;
  const blockedDev = d.devStatuses.filter((s) => s.status === "blocked").length;
  const workingAgents = d.agents.filter((a) => a.current_status === "working").length;

  const moduleNode = (code: string, label: string, href = "/dev"): Node => {
    const m = d.modules.find((x) => x.code === code);
    const status = String(m?.status ?? "planned");
    const state =
      status === "live" ? "completed" : status === "building" ? "processing" : status === "error" ? "danger" : "normal";
    return { key: code, label, href, state, detail: statusJa(status) };
  };

  const nodes: Node[] = [
    {
      key: "dev", label: "開発", href: "/dev",
      state: blockedDev > 0 ? "danger" : activeDev > 0 ? "processing" : "normal",
      detail: blockedDev > 0 ? `ブロッカー${blockedDev}` : `進行中${activeDev}`,
    },
    moduleNode("shift-cloud", "Workforce"),
    { key: "sales", label: "営業", href: "/agents", state: "normal", detail: "待機" },
    { key: "sns", label: "SNS", href: "/agents", state: "normal", detail: "待機" },
    moduleNode("reservation", "予約"),
    moduleNode("inventory", "在庫"),
    moduleNode("finance", "財務", "/finance"),
    { key: "hr", label: "採用", href: "/agents", state: "normal", detail: "待機" },
    { key: "lesson", label: "レッスン", href: "/agents", state: "normal", detail: "待機" },
    moduleNode("kallinos-ec", "KALLINOS"),
    moduleNode("rac-ops", "RAC"),
    {
      key: "agents", label: "AI Agents", href: "/agents",
      state: workingAgents > 0 ? "processing" : "normal",
      detail: `${d.agents.length}体 / 稼働${workingAgents}`,
    },
    {
      key: "approvals", label: "承認待ち", href: "/approvals",
      state: pendingApprovals > 0 ? "approval_required" : "normal",
      detail: `${pendingApprovals}件`,
    },
    {
      key: "risks", label: "リスク", href: "/dev",
      state: openHigh > 0 ? "danger" : d.risks.length > 0 ? "warning" : "normal",
      detail: `open ${d.risks.length}件`,
    },
    { key: "future", label: "未来予測", href: "/future", state: "normal", detail: "シミュレーション" },
  ];

  const N = nodes.length;
  const pos = nodes.map((_, i) => {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    return { x: 50 + 38 * Math.cos(angle), y: 50 + 38 * Math.sin(angle) };
  });

  // KPI表示順（VISION §6: 5大KPI → 次に見る）
  const kpiOrder = [
    "monthly_sales", "members", "trial_bookings", "conversion_rate", "churn_rate", "labor_cost_ratio",
    "operating_profit", "labor_cost", "work_hours", "active_staff",
  ];
  const kpis = kpiOrder
    .map((code) => d.kpis.find((k) => k.code === code))
    .filter((k): k is NonNullable<typeof k> => k != null);

  const scoreColor = grade === "good" ? "text-emerald-300" : grade === "watch" ? "text-amber-300" : "text-red-300";
  const judgmentIcon = { approval: "✓", blocker: "⛔", risk: "⚠", kpi: "📊" } as const;

  return (
    <div className="space-y-6">
      {/* トップ: 全体スコア＋今日の判断リスト（VISION §5） */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="hud reveal flex flex-col justify-between rounded-xl border border-[--color-line] bg-[--color-panel] p-5">
          <p className="text-xs tracking-[0.2em] text-[--color-dim]">今日のYOZAN全体スコア</p>
          <p className={`my-2 text-6xl font-bold tabular-nums ${scoreColor}`}>
            <CountUp value={score} />
            <span className="ml-1 text-xl text-[--color-dim]">点</span>
          </p>
          <div className="space-y-0.5 text-[11px] text-[--color-dim]">
            {factors.length === 0 ? <p>減点要因なし — 順調です</p> : factors.map((f) => <p key={f}>{f}</p>)}
          </div>
        </div>
        <Panel title={`今日、判断すべきこと（${judgments.length}件）`} className="d1 lg:col-span-2">
          {judgments.length === 0 ? (
            <Empty>判断待ちなし — CEO AIが引き続き監視します</Empty>
          ) : (
            <ol className="space-y-2 text-sm">
              {judgments.slice(0, 7).map((j, i) => (
                <li key={`${j.kind}-${i}`}>
                  <Link href={j.href} className="group flex items-start gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-[--color-panel-2]">
                    <span className="shrink-0">{judgmentIcon[j.kind]}</span>
                    <span>
                      <span className="group-hover:text-sky-300">{j.title}</span>
                      {j.detail && <span className="block text-xs text-[--color-dim]">{j.detail}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* コックピットリング */}
      <div className="relative mx-auto aspect-square w-full max-w-3xl">
        <div className="radar-sweep absolute inset-[8%] opacity-70" />
        <div className="orbit absolute inset-[4%] rounded-full border border-dashed border-sky-900/60" />
        <div className="orbit-rev absolute inset-[16%] rounded-full border border-dashed border-indigo-900/50" />
        <div className="absolute left-1/2 top-1/2 h-[76%] w-[76%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[--color-line]" />

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          {pos.map((p, i) => {
            const st = nodes[i].state;
            const stroke =
              st === "danger" ? "rgba(248,113,113,0.5)"
              : st === "approval_required" ? "rgba(192,132,252,0.45)"
              : st === "processing" ? "rgba(56,189,248,0.5)"
              : st === "completed" ? "rgba(52,211,153,0.35)"
              : "rgba(124,138,165,0.18)";
            return (
              <line
                key={nodes[i].key}
                x1="50" y1="50" x2={p.x} y2={p.y}
                stroke={stroke}
                strokeWidth="0.25"
                className="link-line"
                style={{ animationDelay: `${(i % 5) * 0.28}s` }}
              />
            );
          })}
        </svg>

        <Link
          href="/command"
          className="ai-flow absolute left-1/2 top-1/2 z-10 flex h-40 w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-sky-700/60 text-center node-processing transition-transform hover:scale-105"
        >
          <span className="text-[10px] tracking-[0.3em] text-[--color-gold]">YOZAN</span>
          <span className="text-xl font-bold tracking-wider text-sky-200">CEO AI</span>
          <span className="mt-1 text-[10px] text-[--color-dim]">Command Center</span>
          <span className="mt-1 flex items-center gap-1 text-[9px] text-emerald-300">
            <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            ONLINE
          </span>
        </Link>

        {nodes.map((node, i) => {
          const { x, y } = pos[i];
          const stateCls =
            node.state === "danger"
              ? "border-red-500/60 node-danger"
              : node.state === "warning"
                ? "border-amber-500/60"
                : node.state === "processing"
                  ? "border-sky-500/60 node-processing"
                  : node.state === "approval_required"
                    ? "border-purple-500/60 node-processing"
                    : node.state === "completed"
                      ? "border-emerald-500/50"
                      : "border-[--color-line]";
          return (
            <Link
              key={node.key}
              href={node.href}
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${0.05 * i}s` }}
              className={`reveal absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-[--color-panel] text-center transition-all hover:z-20 hover:scale-110 hover:shadow-[0_0_20px_-4px_rgba(56,189,248,0.6)] ${stateCls}`}
            >
              <StatusDot status={node.state} />
              <span className="mt-1 text-[11px] font-medium leading-tight">{node.label}</span>
              <span className="text-[9px] text-[--color-dim]">{node.detail}</span>
            </Link>
          );
        })}
      </div>

      {/* KPIバンド（VISION §6: 5大KPI優先） */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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

      {/* 下段: 状況サマリ */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="ACTIVITY FEED（Company Events）" className="d1">
          {d.recentEvents.length === 0 ? (
            <Empty>イベントなし</Empty>
          ) : (
            <ul className="space-y-2">
              {d.recentEvents.slice(0, 8).map((e) => (
                <li key={String(e.id)} className="flex items-start gap-2 text-sm">
                  <StatusDot status={String(e.severity) === "critical" ? "danger" : String(e.severity) === "warning" ? "warning" : "normal"} />
                  <div className="min-w-0">
                    <p className="truncate">{String(e.title)}</p>
                    <p className="text-xs text-[--color-dim]">
                      {fmtDate(String(e.occurred_at))} ・ {String(e.event_type)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="RISKS / BLOCKERS" className="d2">
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
                  <Badge tone="danger">blocker</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="開発ステータス" className="d3">
          <ul className="space-y-3">
            {d.devStatuses.map((s) => (
              <li key={String(s.id)} className="text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <StatusDot status={String(s.status)} />
                    {String(s.module_name)}
                  </span>
                  <span className="text-xs text-[--color-dim]">{Number(s.progress)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[--color-panel-2]">
                  <div
                    className={`bar-grow h-full ${Number(s.progress) >= 100 ? "bg-emerald-400" : "bg-sky-400"}`}
                    style={{ width: `${Number(s.progress)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function statusJa(s: string) {
  const map: Record<string, string> = {
    live: "稼働中", building: "実装中", designing: "設計中", testing: "テスト中",
    planned: "計画", paused: "停止中", error: "エラー",
  };
  return map[s] ?? s;
}
