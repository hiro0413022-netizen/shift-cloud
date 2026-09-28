/**
 * Developer / Architecture Dashboard の集計（Final Architecture §11・GO条件 5/24）
 *
 * 正典は gn_tool_executions と gn_llm_calls。行を読んで JS で集計する（P0 は件数が小さい。
 * 増えたら SQL 関数に置き換える）。ここは「内部的に何が変わったか」を見る場所。
 */
import type { AdminLike } from "./tool.ts";
import type { ToolRegistry } from "./registry.ts";

export type ExecRow = {
  tool_name: string;
  tool_version: number;
  status: string;
  policy_decision: string | null;
  policy_stage: string | null;
  risk: number;
  surface: string | null;
  origin: string | null;
  actor_kind: string | null;
  duration_ms: number | null;
  silent_zero: boolean | null;
  undone_at: string | null;
  created_at: string;
};

export type LlmRow = { model: string; provider: string; task: string; input_tokens: number; output_tokens: number; cost_usd: number; ok: boolean; duration_ms: number | null };

export type DashboardMetrics = {
  sinceDays: number;
  registry: { total: number; byDomain: Record<string, number>; byRisk: Record<string, number>; latestOnly: number };
  coreApps: string[]; // surface / origin の distinct
  executions: {
    total: number;
    byStatus: Record<string, number>;
    byTool: Array<{ tool: string; count: number; ok: number; failed: number }>;
    avgDurationMs: number;
    successRate: number; // ok+idempotent / (total - needs_approval)
    verifyFailureRate: number;
    permissionDeniedRate: number;
    silentZero: number;
    undo: number;
    undoRate: number;
    humanApproval: number;
    humanApprovalRate: number; // needs_approval / 更新系（risk>=2）
    automationRate: number; // risk>=2 のうち allow で実行された割合
    errors: number;
  };
  llm: { calls: number; ok: number; inputTokens: number; outputTokens: number; costUsd: number; byModel: Record<string, number>; avgDurationMs: number };
  usage: { toolOps: number; auditOps: number; genesisUsageRate: number };
  /** P1 で Command Bar から計測。P0 は枠だけ */
  ux: { avgClicksPerTask: number | null; avgTimePerTaskSec: number | null };
};

/** 純関数（テスト用）: 実行行から集計 */
export function aggregateExecutions(rows: ExecRow[]): DashboardMetrics["executions"] {
  const byStatus: Record<string, number> = {};
  const byToolMap = new Map<string, { count: number; ok: number; failed: number }>();
  let dur = 0;
  let durN = 0;
  let silentZero = 0;
  let undo = 0;
  let write = 0;
  let writeAllow = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const key = `${r.tool_name}@${r.tool_version}`;
    const t = byToolMap.get(key) ?? { count: 0, ok: 0, failed: 0 };
    t.count += 1;
    if (r.status === "ok" || r.status === "idempotent") t.ok += 1;
    if (r.status === "failed" || r.status === "verify_failed") t.failed += 1;
    byToolMap.set(key, t);
    if (r.duration_ms != null) {
      dur += r.duration_ms;
      durN += 1;
    }
    if (r.silent_zero) silentZero += 1;
    if (r.undone_at) undo += 1;
    if (r.risk >= 2) {
      write += 1;
      if (r.status === "ok" && r.policy_decision === "allow") writeAllow += 1;
    }
  }
  const total = rows.length;
  const needs = byStatus["needs_approval"] ?? 0;
  const ok = (byStatus["ok"] ?? 0) + (byStatus["idempotent"] ?? 0);
  const executed = Math.max(0, total - needs);
  const verifyFailed = byStatus["verify_failed"] ?? 0;
  const denied = byStatus["denied"] ?? 0;
  const errors = (byStatus["failed"] ?? 0) + verifyFailed + (byStatus["invalid_input"] ?? 0) + (byStatus["unknown_tool"] ?? 0);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    total,
    byStatus,
    byTool: [...byToolMap.entries()].map(([tool, v]) => ({ tool, ...v })).sort((a, b) => b.count - a.count),
    avgDurationMs: durN ? Math.round(dur / durN) : 0,
    successRate: pct(ok, executed),
    verifyFailureRate: pct(verifyFailed, executed),
    permissionDeniedRate: pct(denied, total),
    silentZero,
    undo,
    undoRate: pct(undo, ok),
    humanApproval: needs,
    humanApprovalRate: pct(needs, write),
    automationRate: pct(writeAllow, write),
    errors,
  };
}

export function aggregateLlm(rows: LlmRow[]): DashboardMetrics["llm"] {
  const byModel: Record<string, number> = {};
  let inTok = 0;
  let outTok = 0;
  let cost = 0;
  let ok = 0;
  let dur = 0;
  let durN = 0;
  for (const r of rows) {
    byModel[r.model] = (byModel[r.model] ?? 0) + 1;
    inTok += r.input_tokens ?? 0;
    outTok += r.output_tokens ?? 0;
    cost += Number(r.cost_usd ?? 0);
    if (r.ok) ok += 1;
    if (r.duration_ms != null) {
      dur += r.duration_ms;
      durN += 1;
    }
  }
  return { calls: rows.length, ok, inputTokens: inTok, outputTokens: outTok, costUsd: Math.round(cost * 10000) / 10000, byModel, avgDurationMs: durN ? Math.round(dur / durN) : 0 };
}

export async function dashboardMetrics(admin: AdminLike, companyId: string, registry: ToolRegistry, sinceDays = 7): Promise<DashboardMetrics> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const [execRes, llmRes, auditRes] = await Promise.all([
    admin
      .from("gn_tool_executions")
      .select("tool_name, tool_version, status, policy_decision, policy_stage, risk, surface, origin, actor_kind, duration_ms, silent_zero, undone_at, created_at")
      .eq("company_id", companyId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
    admin.from("gn_llm_calls").select("model, provider, task, input_tokens, output_tokens, cost_usd, ok, duration_ms").eq("company_id", companyId).gte("created_at", since).limit(5000),
    admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", since),
  ]);
  const execRows = ((execRes as { data?: ExecRow[] }).data ?? []) as ExecRow[];
  const llmRows = ((llmRes as { data?: LlmRow[] }).data ?? []) as LlmRow[];
  const auditOps = (auditRes as { count?: number | null }).count ?? 0;

  const all = registry.list();
  const byDomain: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  for (const t of all) {
    byDomain[t.domain] = (byDomain[t.domain] ?? 0) + 1;
    byRisk[String(t.risk)] = (byRisk[String(t.risk)] ?? 0) + 1;
  }
  const executions = aggregateExecutions(execRows);
  const apps = new Set<string>();
  for (const r of execRows) {
    if (r.surface) apps.add(r.surface);
    if (r.origin && !r.origin.includes("@")) apps.add(r.origin);
  }
  const toolOps = execRows.filter((r) => r.status === "ok" && r.risk >= 1).length;
  return {
    sinceDays,
    registry: { total: all.length, byDomain, byRisk, latestOnly: registry.list({ latestOnly: true }).length },
    coreApps: [...apps].sort(),
    executions,
    llm: aggregateLlm(llmRows),
    usage: { toolOps, auditOps, genesisUsageRate: auditOps > 0 ? Math.round((toolOps / auditOps) * 1000) / 10 : 0 },
    ux: { avgClicksPerTask: null, avgTimePerTaskSec: null },
  };
}
