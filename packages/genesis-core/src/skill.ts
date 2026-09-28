/**
 * Skill（Final Architecture §5 / P3-a・#294）
 *
 * Skill ＝ 複数の Tool を Plan（DAG）で束ねた「業務の手順」。
 *   - Skill 自身も Tool として Registry に載る（skill.morning_briefing@1）ので、JARVIS / MCP / API / cron から同じ口で呼べる。
 *   - Step の Tool 呼び出しは ctx.call → executeTool を通る＝Policy・rateLimit・記録は Step ごとに効く。
 *     Skill は権限を「まとめて持たない」。Step の Tool が deny なら、その Step だけ denied として結果に残る。
 *   - 承認が要る Step（needs_approval）は Skill の中では実行せず waiting_approval で止め、PlanCard に「承認が要る」と出す。
 *     （承認キューへの投入は apps 側 runWithContext の責務。Skill が黙って書き込みに進まない）
 *   - 依存の無い Step は並列に走る（readySteps が返す分を Promise.all）。
 *
 * 出力の形: { __plan: 1, goal, status, steps:[{key,title,tool,status,output,error,renders,sources,kind,rowCount}] }
 * render.ts はこれを PlanCard ＋ 各 Step の Block に展開する。
 */
import type { ToolContract, ToolCtx, ToolOutput, Domain, SourceRef, FactKind } from "./tool.ts";
import type { JsonSchema } from "./schema.ts";
import type { GenesisContext } from "./context.ts";
import { type Plan, type PlanStep, newStep, validatePlan, readySteps, bindInput, planStatus } from "./plan.ts";

export type SkillStepDef = Omit<Partial<PlanStep>, "status" | "output" | "error" | "executionId"> & { key: string; tool: string };

export type SkillContract<I extends Record<string, unknown> = Record<string, unknown>> = {
  name: string; // 'skill.morning_briefing'
  version: number;
  domain: Domain;
  description: string;
  input: JsonSchema;
  /** Skill の入口を制限する（Step の Tool 権限はそれぞれ別に効く）。空＝ログイン済みなら誰でも */
  permission: string[];
  /** Skill が組み立てる手順。input と Context から Step を作る（日付の既定などはここで決める） */
  steps: (input: I, context: GenesisContext) => SkillStepDef[];
  /** 全 Step が終わったあとに要約を作る（省略可）。LLM を使わず、Step の出力から文字列を組む */
  summarize?: (steps: PlanStep[], input: I, context: GenesisContext) => string;
  rateLimit?: { perMinute: number };
};

export type SkillStepResult = {
  key: string;
  title: string;
  tool: string;
  status: PlanStep["status"];
  output: unknown;
  error: string | null;
  renders: string | null;
  sources: SourceRef[];
  kind: FactKind;
  rowCount: number | null;
};

export type SkillOutput = {
  __plan: 1;
  goal: string;
  status: string;
  summary: string;
  steps: SkillStepResult[];
};

/** Plan（DAG）を ctx.call で実行する。Skill の外（Workflow・Agent）からも使える汎用の実行器 */
export async function runPlan(plan: Plan, ctx: ToolCtx, opts: { maxRounds?: number } = {}): Promise<{ plan: Plan; results: SkillStepResult[] }> {
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(`Plan が不正: ${errors.join(" / ")}`);
  const info = new Map<string, Partial<SkillStepResult>>();
  plan.status = "running";
  const maxRounds = opts.maxRounds ?? plan.steps.length + 1;
  for (let round = 0; round < maxRounds; round += 1) {
    const ready = readySteps(plan);
    if (!ready.length) break;
    await Promise.all(
      ready.map(async (s) => {
        s.status = "running";
        const input = bindInput(s, plan.steps);
        try {
          const r = await ctx.call(s.tool, input);
          info.set(s.key, { renders: r.renders ?? null, sources: r.sources ?? [], kind: r.kind ?? "fact", rowCount: r.rowCount ?? null });
          s.executionId = r.executionId ?? null;
          if (r.status === "ok" || r.status === "idempotent") {
            s.status = "done";
            s.output = r.output;
          } else if (r.status === "needs_approval") {
            s.status = "waiting_approval";
            s.error = r.policy?.reason ?? "承認が要ります";
          } else {
            s.status = "failed";
            s.error = r.error ?? r.status;
          }
        } catch (e) {
          s.status = "failed";
          s.error = e instanceof Error ? e.message : String(e);
        }
      })
    );
  }
  // 最後まで pending のまま残った Step（依存が waiting_approval 等で止まった）は skipped に
  for (const s of plan.steps) if (s.status === "pending" || s.status === "ready") { s.status = "skipped"; s.error = s.error ?? "前の Step が終わらなかった"; }
  plan.status = planStatus(plan);
  const results: SkillStepResult[] = plan.steps.map((s) => ({
    key: s.key,
    title: s.title ?? s.tool,
    tool: s.tool,
    status: s.status,
    output: s.output ?? null,
    error: s.error ?? null,
    renders: info.get(s.key)?.renders ?? null,
    sources: info.get(s.key)?.sources ?? [],
    kind: info.get(s.key)?.kind ?? "fact",
    rowCount: info.get(s.key)?.rowCount ?? null,
  }));
  return { plan, results };
}

/** Skill → Tool Contract。Registry には Tool として登録する（Skill の並列名簿を作らない） */
export function skillToTool<I extends Record<string, unknown>>(skill: SkillContract<I>): ToolContract {
  const tool: ToolContract = {
    name: skill.name,
    version: skill.version,
    domain: skill.domain,
    description: skill.description,
    input: skill.input,
    output: { type: "object", required: ["__plan", "goal", "status", "steps"], properties: { __plan: { type: "integer" }, goal: { type: "string" }, status: { type: "string" }, summary: { type: "string" }, steps: { type: "array" } } },
    permission: skill.permission,
    scope: "company",
    // Skill 自体は「手順」なので risk 0。書き込む Step の risk はその Step の Tool が持ち、Policy はそこで効く
    risk: 0,
    idempotency: () => null,
    rateLimit: skill.rateLimit ?? { perMinute: 10 },
    emits: [],
    renders: "PlanCard",
    impl: async (input, ctx): Promise<ToolOutput> => {
      const defs = skill.steps(input as I, ctx.context);
      const plan: Plan = { id: null, goal: skill.description, status: "draft", steps: defs.map((d) => newStep({ ...d, input: d.input ?? {}, dependsOn: d.dependsOn ?? [] })) };
      const { results } = await runPlan(plan, ctx);
      const summary = skill.summarize ? safe(() => skill.summarize!(plan.steps, input as I, ctx.context)) : defaultSummary(results);
      const sources = results.flatMap((r) => r.sources);
      const out: SkillOutput = { __plan: 1, goal: plan.goal, status: plan.status, summary, steps: results };
      return { data: out as unknown as Record<string, unknown>, sources, kind: "fact", rowCount: results.filter((r) => r.status === "done").length };
    },
  };
  return tool;
}

function safe(f: () => string): string {
  try {
    return f();
  } catch (e) {
    return `（要約に失敗: ${e instanceof Error ? e.message : String(e)}）`;
  }
}

export function defaultSummary(results: SkillStepResult[]): string {
  const done = results.filter((r) => r.status === "done").length;
  const wait = results.filter((r) => r.status === "waiting_approval").length;
  const fail = results.filter((r) => r.status === "failed").length;
  const parts = [`${done}/${results.length} 手順が完了`];
  if (wait) parts.push(`${wait} 件は承認が要ります`);
  if (fail) parts.push(`${fail} 件は失敗`);
  return parts.join("・");
}

export function defineSkill<I extends Record<string, unknown>>(s: SkillContract<I>): SkillContract<I> {
  return s;
}

/** Step の出力から行を取り出す（rows / items）。summarize で使う小道具 */
export function stepRows(steps: PlanStep[], key: string): Array<Record<string, unknown>> {
  const s = steps.find((x) => x.key === key);
  const o = (s?.output ?? {}) as Record<string, unknown>;
  return Array.isArray(o.rows) ? (o.rows as Array<Record<string, unknown>>) : Array.isArray(o.items) ? (o.items as Array<Record<string, unknown>>) : [];
}

export function stepOut(steps: PlanStep[], key: string): Record<string, unknown> {
  const s = steps.find((x) => x.key === key);
  return (s?.status === "done" ? (s.output as Record<string, unknown>) : null) ?? {};
}
