import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { jstYmd } from "@/lib/jst";

/**
 * AI週次成績表（#83 / REDESIGN §10-4）
 * 毎週月曜、直近7日の各AIの「作った・承認された・却下された・実行した」を集計して記録。
 * 成果の出ないAIを可視化し、CEO AI日次・ダイジェストの観測に流す。
 */

const LOOP_CODE = "ai_scorecard";

export async function runAiScorecard(companyId: string): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const today = jstYmd();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (dow !== 1) return { skipped: "not_monday" };

  let { data: loop } = await admin
    .from("gn_loops")
    .select("id, enabled")
    .eq("company_id", companyId)
    .eq("code", LOOP_CODE)
    .maybeSingle();
  if (!loop) {
    const ins = await admin
      .from("gn_loops")
      .insert({ company_id: companyId, code: LOOP_CODE, name: "AI週次成績表", config: {} })
      .select("id, enabled")
      .single();
    loop = ins.data;
  }
  if (!loop || loop.enabled === false) return { skipped: "disabled" };

  const { data: existing } = await admin
    .from("gn_loop_runs")
    .select("id")
    .eq("loop_id", loop.id)
    .eq("run_date", today)
    .maybeSingle();
  if (existing) return { skipped: "already_ran" };

  const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const [logsRes, queueRes, agentsRes, loopRunsRes] = await Promise.all([
    admin
      .from("ai_execution_logs")
      .select("agent_id, review_status")
      .eq("company_id", companyId)
      .gte("created_at", since),
    admin.from("ai_action_queue").select("action_type, status").eq("company_id", companyId).gte("created_at", since),
    admin.from("ai_agents").select("id, code, name").eq("company_id", companyId),
    admin
      .from("gn_loop_runs")
      .select("decision, result")
      .eq("company_id", companyId)
      .gte("run_date", jstYmd(new Date(Date.now() - 7 * 24 * 3600_000))),
  ]);

  const agentName = new Map((agentsRes.data ?? []).map((a) => [String(a.id), String(a.name ?? a.code)]));
  const byAgent = new Map<string, { made: number; approved: number; rejected: number }>();
  for (const l of logsRes.data ?? []) {
    const key = agentName.get(String(l.agent_id)) ?? "その他AI";
    const acc = byAgent.get(key) ?? { made: 0, approved: 0, rejected: 0 };
    acc.made += 1;
    if (l.review_status === "approved") acc.approved += 1;
    if (l.review_status === "rejected") acc.rejected += 1;
    byAgent.set(key, acc);
  }
  const actions = { total: (queueRes.data ?? []).length, done: (queueRes.data ?? []).filter((q) => q.status === "done").length };
  const loopActs = (loopRunsRes.data ?? []).filter((r) => r.decision === "act").length;

  const observed = {
    agents: Object.fromEntries(byAgent),
    actions,
    loop_acts: loopActs,
  };

  const topLine = Array.from(byAgent.entries())
    .sort((a, b) => b[1].made - a[1].made)
    .slice(0, 3)
    .map(([name, v]) => `${name}${v.made}件(承認${v.approved})`)
    .join("・");

  await admin.from("gn_loop_runs").insert({
    company_id: companyId,
    loop_id: loop.id,
    run_date: today,
    observed,
    decision: "act",
    reason: "週次集計",
  });
  await logEvent(companyId, {
    event_type: "ai.scorecard",
    title: `AI週次成績表: 成果物${(logsRes.data ?? []).length}件・実行${actions.done}/${actions.total}件・ループ打ち手${loopActs}件${topLine ? `（${topLine}）` : ""}`.slice(0, 120),
    source: "ai_scorecard",
    source_type: "ai",
  });
  return observed;
}
