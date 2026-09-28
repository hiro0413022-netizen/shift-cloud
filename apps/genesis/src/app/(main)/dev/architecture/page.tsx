import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty } from "@/components/ui";
import { getCore } from "@/core/registry";
import { dashboardMetrics } from "@yozan/genesis-core/metrics";
import { JOB_EXPECTATIONS, staleJobs } from "@yozan/genesis-core/scheduler";

export const dynamic = "force-dynamic";

/**
 * Developer / Architecture Dashboard（Genesis Core P0・GO条件 5 と 24）
 * 「見た目は変わらない P0 で、内部的に何が変わったか」を見る場所。正典は gn_tool_executions / gn_llm_calls。
 */
export default async function ArchitecturePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const actor = await requireGenesisActor();
  const sp = await searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.days ?? 7) || 7));
  const admin = createAdmin();
  const core = getCore();
  const m = await dashboardMetrics(admin, actor.companyId, core.registry, days);
  const tools = core.registry.list({ latestOnly: true });
  const recent = await admin
    .from("gn_tool_executions")
    .select("id, tool_name, tool_version, status, policy_decision, policy_stage, risk, surface, origin, actor_kind, duration_ms, error, silent_zero, created_at")
    .eq("company_id", actor.companyId)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (recent.data ?? []) as Array<Record<string, unknown>>;
  // 定期処理の台帳（#296）: genesis と demo-sales の cron が同じ gn_job_runs に記録する
  const stale = await staleJobs(admin);
  const jobRuns = await admin.from("gn_job_runs").select("job, started_at, ok, error").order("started_at", { ascending: false }).limit(200);
  const lastByJob = new Map<string, { started_at: string; ok: boolean | null; error: string | null }>();
  for (const r of (jobRuns.data ?? []) as Array<{ job: string; started_at: string; ok: boolean | null; error: string | null }>) if (!lastByJob.has(r.job)) lastByJob.set(r.job, r);

  const kpi = (label: string, value: string | number, sub?: string, tone?: "ok" | "warn" | "danger") => (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3">
      <p className="text-[11px] text-(--color-dim)">{label}</p>
      <p className={`text-xl font-bold ${tone === "danger" ? "text-red-400" : tone === "warn" ? "text-amber-400" : ""}`}>{value}</p>
      {sub ? <p className="text-[11px] text-(--color-dim)">{sub}</p> : null}
    </div>
  );
  const pct = (v: number) => `${v}%`;
  const statusTone = (s: string) => (s === "ok" || s === "idempotent" ? "ok" : s === "needs_approval" ? "accent" : s === "denied" ? "warn" : s === "running" ? "default" : "danger");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Genesis Core — Architecture Dashboard</h1>
          <p className="text-sm text-(--color-dim)">P0: Tool Registry / Policy Engine / Action Engine の内部状態。直近 {days} 日</p>
        </div>
        <div className="flex gap-1 text-xs">
          {[1, 7, 30].map((d) => (
            <a key={d} href={`/dev/architecture?days=${d}`} className={`rounded-lg border border-(--color-line) px-2 py-1 ${d === days ? "bg-(--color-panel) font-bold" : "text-(--color-dim)"}`}>
              {d}日
            </a>
          ))}
        </div>
      </header>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
        {kpi("登録Tool", m.registry.total, Object.entries(m.registry.byDomain).map(([k, v]) => `${k} ${v}`).join(" · "))}
        {kpi("Core利用（surface/origin）", m.coreApps.length, m.coreApps.join(", ") || "まだ実行なし")}
        {kpi("Tool Execution", m.executions.total, `成功率 ${pct(m.executions.successRate)} · 平均 ${m.executions.avgDurationMs}ms`)}
        {kpi("LLM Call", m.llm.calls, `$${m.llm.costUsd} · in ${m.llm.inputTokens} / out ${m.llm.outputTokens}`)}
        {kpi("Error", m.executions.errors, "failed / verify_failed / invalid_input / unknown", m.executions.errors ? "danger" : undefined)}
        {kpi("Permission Denied", m.executions.byStatus["denied"] ?? 0, pct(m.executions.permissionDeniedRate), (m.executions.byStatus["denied"] ?? 0) ? "warn" : undefined)}
        {kpi("Verification Failure", m.executions.byStatus["verify_failed"] ?? 0, pct(m.executions.verifyFailureRate), (m.executions.byStatus["verify_failed"] ?? 0) ? "danger" : undefined)}
        {kpi("Silent Zero", m.executions.silentZero, "読みToolが期待下限を下回った", m.executions.silentZero ? "warn" : undefined)}
        {kpi("Genesis Usage Rate", pct(m.usage.genesisUsageRate), `Tool経由 ${m.usage.toolOps} / 監査ログ ${m.usage.auditOps}`)}
        {kpi("Automation Rate", pct(m.executions.automationRate), "更新系のうち承認なしで実行")}
        {kpi("Human Approval Rate", pct(m.executions.humanApprovalRate), `承認待ち ${m.executions.humanApproval} 件`)}
        {kpi("Undo Rate", pct(m.executions.undoRate), `取消 ${m.executions.undo} 件`)}
        {kpi("Avg Clicks / Task", m.ux.avgClicksPerTask ?? "—", "P1 で Command Bar から計測")}
        {kpi("Avg Time / Task", m.ux.avgTimePerTaskSec ?? "—", "P1 で計測")}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Tool Registry（最新版 ${tools.length} 本）`}>
          <table className="w-full text-xs">
            <thead className="text-(--color-dim)">
              <tr>
                <th className="text-left py-1">Tool</th>
                <th className="text-left">domain</th>
                <th className="text-left">risk</th>
                <th className="text-left">scope</th>
                <th className="text-left">permission</th>
                <th className="text-left">renders</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.ref} className="border-t border-(--color-line)">
                  <td className="py-1 font-mono">{t.ref}</td>
                  <td>{t.domain}</td>
                  <td>
                    <Badge tone={t.risk >= 3 ? "danger" : t.risk === 2 ? "warn" : "ok"}>{t.risk}</Badge>
                  </td>
                  <td>{t.scope}</td>
                  <td className="text-(--color-dim)">{t.permission.join(" / ") || "—"}</td>
                  <td className="text-(--color-dim)">{t.renders}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-(--color-dim)">
            Block {core.blocks.list().length} 種 · Event {core.catalog.list().length} 種 · MCP manifest: <code>/api/core/mcp</code> · 一覧: <code>/api/core/tools</code>
          </p>
        </Panel>

        <Panel title="Tool 別の実行">
          {m.executions.byTool.length === 0 ? (
            <Empty>まだ Tool 実行がありません。JARVIS で「予約を入れて」と言うか、/api/core/tools/booking.list を POST すると増えます。</Empty>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-(--color-dim)">
                <tr>
                  <th className="text-left py-1">Tool</th>
                  <th className="text-right">回数</th>
                  <th className="text-right">成功</th>
                  <th className="text-right">失敗</th>
                </tr>
              </thead>
              <tbody>
                {m.executions.byTool.map((t) => (
                  <tr key={t.tool} className="border-t border-(--color-line)">
                    <td className="py-1 font-mono">{t.tool}</td>
                    <td className="text-right">{t.count}</td>
                    <td className="text-right">{t.ok}</td>
                    <td className={`text-right ${t.failed ? "text-red-400" : ""}`}>{t.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 text-[11px] text-(--color-dim)">
            状態別: {Object.entries(m.executions.byStatus).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
            <br />
            LLM モデル別: {Object.entries(m.llm.byModel).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
          </div>
        </Panel>
      </div>

      <Panel title={`定期処理（${stale.length ? `${stale.length} 本に問題` : "すべて期待どおり"}）`}>
        <table className="w-full text-xs">
          <thead className="text-(--color-dim)">
            <tr>
              <th className="text-left py-1">job</th>
              <th className="text-left">内容</th>
              <th className="text-right">最終実行</th>
              <th className="text-right">上限</th>
              <th className="text-left pl-3">状態</th>
            </tr>
          </thead>
          <tbody>
            {JOB_EXPECTATIONS.map((e) => {
              const last = lastByJob.get(e.job);
              const bad = stale.find((s) => s.job === e.job);
              return (
                <tr key={e.job} className="border-t border-(--color-line)">
                  <td className="py-1 font-mono">{e.job}</td>
                  <td className="text-(--color-dim)">{e.label}</td>
                  <td className="text-right">{last ? String(last.started_at).slice(0, 16).replace("T", " ") : "記録なし"}</td>
                  <td className="text-right">{e.maxAgeMin}分</td>
                  <td className={`pl-3 ${bad ? "text-red-400" : "text-emerald-400"}`}>{bad ? (bad.ageMin == null ? "未記録" : bad.lastOk === false ? `失敗: ${bad.lastError ?? ""}` : `${bad.ageMin}分前で停止`) : "OK"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-(--color-dim)">記録は gn_job_runs（withJobRun）。Ask Data では gnv_job_runs。止まると Inbox にルール jobs_stale が出る（cron:execute 自身が止まるとルールも走らないので、この画面と health.check で見る）。</p>
      </Panel>

      <Panel title="直近の実行（30件）">
        {rows.length === 0 ? (
          <Empty>実行記録なし</Empty>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-(--color-dim)">
              <tr>
                <th className="text-left py-1">時刻</th>
                <th className="text-left">Tool</th>
                <th className="text-left">状態</th>
                <th className="text-left">Policy</th>
                <th className="text-left">surface / origin</th>
                <th className="text-left">actor</th>
                <th className="text-right">ms</th>
                <th className="text-left">エラー</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-t border-(--color-line)">
                  <td className="py-1 whitespace-nowrap">{new Date(String(r.created_at)).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="font-mono">
                    {String(r.tool_name)}@{String(r.tool_version)}
                  </td>
                  <td>
                    <Badge tone={statusTone(String(r.status))}>{String(r.status)}</Badge>
                    {r.silent_zero ? <Badge tone="warn">0件</Badge> : null}
                  </td>
                  <td className="text-(--color-dim)">
                    {String(r.policy_decision ?? "—")}
                    {r.policy_stage ? ` (${String(r.policy_stage)})` : ""}
                  </td>
                  <td className="text-(--color-dim)">
                    {String(r.surface ?? "—")} / {String(r.origin ?? "—")}
                  </td>
                  <td className="text-(--color-dim)">{String(r.actor_kind ?? "")}</td>
                  <td className="text-right">{r.duration_ms == null ? "—" : String(r.duration_ms)}</td>
                  <td className="text-red-400 max-w-[280px] truncate">{r.error ? String(r.error) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
