/**
 * Plan / Execution Data Model（Final Architecture §5）
 *
 * Plan は Tool 呼び出しの DAG。P0 は逐次実行だが、データモデルは依存・並列・条件を最初から持つ。
 *   A ─┐
 *      ├→ C → D
 *   B ─┘
 * readySteps() が「今実行できる Step」を返す。並列実行はその戻りを同時に回すだけ。
 */

export type StepStatus = "pending" | "ready" | "running" | "waiting_approval" | "done" | "skipped" | "failed";
export type PlanStatus = "draft" | "running" | "waiting_approval" | "done" | "failed" | "cancelled";

export type StepCondition = {
  /** 参照する Step の key */
  stepKey: string;
  /** output の中のパス 'data.count' */
  path: string;
  op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "exists" | "truthy";
  value?: unknown;
};

export type PlanStep = {
  key: string;
  tool: string; // 'shift.generate@1'（Workflow は固定版で書く）
  input: Record<string, unknown>;
  dependsOn: string[];
  condition?: StepCondition | null;
  /** 依存 Step の出力を input に流し込む { "input.date": "a.data.date" } */
  bind?: Record<string, string>;
  status: StepStatus;
  output?: unknown;
  executionId?: string | null;
  error?: string | null;
  title?: string;
};

export type Plan = {
  id: string | null;
  goal: string;
  status: PlanStatus;
  steps: PlanStep[];
  surface?: string;
};

export function newStep(s: Partial<PlanStep> & { key: string; tool: string }): PlanStep {
  return { input: {}, dependsOn: [], status: "pending", condition: null, ...s };
}

/** 循環・未知の依存・重複 key を検出。登録時に拒否する */
export function validatePlan(plan: Plan): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const s of plan.steps) {
    if (keys.has(s.key)) errors.push(`Step key 重複: ${s.key}`);
    keys.add(s.key);
  }
  for (const s of plan.steps) {
    for (const d of s.dependsOn) if (!keys.has(d)) errors.push(`${s.key}: 未知の依存 ${d}`);
    if (s.condition && !keys.has(s.condition.stepKey)) errors.push(`${s.key}: 条件が未知の Step ${s.condition.stepKey} を参照`);
  }
  // 循環（DFS）
  const state = new Map<string, 0 | 1 | 2>();
  const byKey = new Map(plan.steps.map((s) => [s.key, s]));
  const visit = (k: string, trail: string[]) => {
    const st = state.get(k) ?? 0;
    if (st === 1) {
      errors.push(`循環: ${[...trail, k].join(" → ")}`);
      return;
    }
    if (st === 2) return;
    state.set(k, 1);
    for (const d of byKey.get(k)?.dependsOn ?? []) if (byKey.has(d)) visit(d, [...trail, k]);
    state.set(k, 2);
  };
  for (const s of plan.steps) visit(s.key, []);
  return errors;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

export function evaluateCondition(c: StepCondition, steps: PlanStep[]): boolean {
  const ref = steps.find((s) => s.key === c.stepKey);
  if (!ref || ref.status !== "done") return false;
  const v = getPath(ref.output, c.path);
  switch (c.op) {
    case "exists":
      return v !== undefined && v !== null;
    case "truthy":
      return !!v;
    case "eq":
      return v === c.value;
    case "ne":
      return v !== c.value;
    case "gt":
      return Number(v) > Number(c.value);
    case "gte":
      return Number(v) >= Number(c.value);
    case "lt":
      return Number(v) < Number(c.value);
    case "lte":
      return Number(v) <= Number(c.value);
  }
}

/**
 * 今すぐ実行できる Step。依存が全部 done で、条件を満たすもの。
 * 依存が failed/skipped の Step は skipped に落とす（副作用: steps を書き換える）。
 */
export function readySteps(plan: Plan): PlanStep[] {
  const byKey = new Map(plan.steps.map((s) => [s.key, s]));
  const out: PlanStep[] = [];
  for (const s of plan.steps) {
    if (s.status !== "pending" && s.status !== "ready") continue;
    const deps = s.dependsOn.map((d) => byKey.get(d)!);
    if (deps.some((d) => d.status === "failed" || d.status === "skipped")) {
      s.status = "skipped";
      s.error = "依存 Step が失敗または skip";
      continue;
    }
    if (!deps.every((d) => d.status === "done")) continue;
    if (s.condition && !evaluateCondition(s.condition, plan.steps)) {
      s.status = "skipped";
      s.error = "条件不成立";
      continue;
    }
    out.push(s);
  }
  return out;
}

/** bind に従って依存 Step の出力を input に流し込む */
export function bindInput(step: PlanStep, steps: PlanStep[]): Record<string, unknown> {
  const input = { ...step.input };
  for (const [target, source] of Object.entries(step.bind ?? {})) {
    const [srcKey, ...rest] = source.split(".");
    const ref = steps.find((s) => s.key === srcKey);
    if (!ref) continue;
    const v = getPath(ref.output, rest.join("."));
    if (v !== undefined) input[target.replace(/^input\./, "")] = v;
  }
  return input;
}

/** Plan 全体の状態を Step から決める */
export function planStatus(plan: Plan): PlanStatus {
  const st = plan.steps.map((s) => s.status);
  if (st.some((s) => s === "failed")) return "failed";
  if (st.some((s) => s === "waiting_approval")) return "waiting_approval";
  if (st.every((s) => s === "done" || s === "skipped")) return "done";
  if (st.some((s) => s === "running")) return "running";
  return plan.status === "draft" ? "draft" : "running";
}

/** 直列の Tool 列を Plan にする（P0 の簡易生成。各 Step は前の Step に依存） */
export function linearPlan(goal: string, tools: Array<{ tool: string; input?: Record<string, unknown>; title?: string }>): Plan {
  const steps = tools.map((t, i) =>
    newStep({ key: `s${i + 1}`, tool: t.tool, input: t.input ?? {}, title: t.title, dependsOn: i === 0 ? [] : [`s${i}`] })
  );
  return { id: null, goal, status: "draft", steps };
}
