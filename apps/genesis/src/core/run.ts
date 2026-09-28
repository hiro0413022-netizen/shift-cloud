import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { GenesisActor } from "@/lib/auth";
import { executeTool, type ExecutionResult } from "@yozan/genesis-core/execute";
import { loadPolicySet } from "@yozan/genesis-core/policy";
import { runPlan } from "@yozan/genesis-core/skill";
import { newStep, type Plan } from "@yozan/genesis-core/plan";
import type { WorkflowContract, EventRow } from "@yozan/genesis-core/workflow";
import type { ToolCtx } from "@yozan/genesis-core/tool";
import type { CoreActor, GenesisContext, Surface } from "@yozan/genesis-core/context";
import { getCore } from "./registry";
import { toCoreActor, coreActorFromStaffId, buildGenesisContext } from "./actor";

/* ============================================================
   Genesis Core API の実行口（apps 側）

   runTool(): 画面・API・MCP から。承認が要る decision は **ここでは実行せず**
   既存の ai_action_queue（#61/#186）に積む。承認・取消枠を経て runQueuedTool() が force:true で実行する。
   ai_action_queue.action_type = Tool 名（'booking.create'）。payload = { __core: 1, tool, input, execution_id }。
   ============================================================ */

type Admin = ReturnType<typeof createAdmin>;

export type RunResult = ExecutionResult & { queued?: { id: string | null; mode: string; runsAt: string } | null };

export async function runTool(args: {
  actor: GenesisActor;
  ref: string;
  input: Record<string, unknown>;
  surface?: Surface;
  storeId?: string | null;
  origin?: string;
  title?: string;
  /** JARVIS など、元の発話 */
  said?: string | null;
  /** Focus（#304）: 省略時は cookie から読む（画面からの呼び出し） */
  focus?: { store?: string | null; project?: string | null } | null;
}): Promise<RunResult> {
  const admin = createAdmin();
  const core = getCore();
  const coreActor = await toCoreActor(admin, args.actor);
  let focus = args.focus;
  if (focus === undefined) {
    try {
      const { readFocus } = await import("@/lib/focus");
      const f = await readFocus(args.actor);
      focus = { store: f.store, project: f.project };
    } catch {
      focus = null;
    }
  }
  const context = await buildGenesisContext(admin, coreActor, args.actor.companyId, { surface: args.surface ?? "web", storeId: args.storeId ?? null, focus });
  return runWithContext({ admin, context, ref: args.ref, input: args.input, origin: args.origin ?? "api", title: args.title, said: args.said ?? null, createdBy: args.actor.staffId });
}

export async function runWithContext(args: {
  admin: Admin;
  context: GenesisContext;
  ref: string;
  input: Record<string, unknown>;
  origin: string;
  title?: string;
  said?: string | null;
  createdBy: string | null;
  force?: boolean;
  /** 承認キューの重複防止キー（ルールの Act など、同じ日に同じ行を2度積まない） */
  dedupeKey?: string | null;
}): Promise<RunResult> {
  const core = getCore();
  const policy = await loadPolicySet(args.admin, args.context.company.id);
  const r = await executeTool({ registry: core.registry, admin: args.admin, context: args.context, ref: args.ref, input: args.input, policy, catalog: core.catalog, origin: args.origin, force: args.force });
  if (r.status !== "needs_approval" || !r.policy) return { ...r, queued: null };

  // 承認 / 取消枠 → 既存キューへ（承認UI・取消UI・監査ログはそのまま使う）
  const { enqueueAction } = await import("@/lib/ai-execution");
  const tool = core.registry.resolve(args.ref)!;
  const mode = r.policy.decision === "allow" ? "auto" : r.policy.decision === "auto_undo" ? "auto_undo" : "approval";
  const q = await enqueueAction(args.admin, {
    companyId: args.context.company.id,
    actionType: tool.name,
    title: args.title ?? `${tool.description.split("。")[0]}`,
    payload: { __core: 1, tool: r.tool, input: args.input, execution_id: r.executionId, _said: args.said ?? undefined, policy: r.policy },
    originKind: args.origin,
    createdBy: args.createdBy,
    dedupeKey: args.dedupeKey ?? null,
    modeOverride: { mode, undoMinutes: r.policy.undoMinutes },
  });
  return { ...r, queued: { id: q.id, mode: q.mode, runsAt: q.scheduledAt } };
}

/** Proactive ルールの Act（#294）: cron から。起点が人でない＝AI Actor なので risk>=2 は Policy で承認待ちになる */
export async function runRuleAct(admin: Admin, args: { companyId: string; tool: string; input: Record<string, unknown>; title: string; dedupeKey: string }): Promise<{ status: string; queuedId?: string | null; error?: string | null }> {
  const actor = await coreActorFromStaffId(admin, args.companyId, null);
  const context = await buildGenesisContext(admin, actor, args.companyId, { surface: "cron", enrich: false });
  const r = await runWithContext({ admin, context, ref: args.tool, input: args.input, origin: "rule", title: args.title, createdBy: null, dedupeKey: args.dedupeKey });
  return { status: r.status, queuedId: r.queued?.id ?? null, error: r.error };
}

/** Workflow（#298）: gn_events に合う宣言を Plan として実行。Step は runWithContext を通る＝承認が要る Step は承認キューへ。
 *  起点が人でない＝AI Actor（代理元なし）。Skill と違い「承認待ち」は成功扱い（承認カードが出ている） */
export async function runWorkflowForEvent(admin: Admin, wf: WorkflowContract, event: EventRow): Promise<{ status: string; error?: string | null }> {
  const actor = await coreActorFromStaffId(admin, event.company_id, null);
  const context = await buildGenesisContext(admin, actor, event.company_id, { surface: "cron", storeId: event.store_id ?? null, enrich: false });
  const defs = wf.steps(event);
  const plan: Plan = { id: null, goal: wf.description, status: "draft", steps: defs.map((d) => newStep({ ...d, input: d.input ?? {}, dependsOn: d.dependsOn ?? [] })) };
  const ctx: ToolCtx = {
    admin,
    context,
    pack: getCore().registry.pack,
    call: async (ref, input) => {
      const r = await runWithContext({ admin, context, ref, input, origin: `workflow:${wf.name}`, title: `${wf.description}（${event.type}）`, createdBy: null, dedupeKey: `wf:${wf.name}:${event.id}:${ref}` });
      return { status: r.status, output: r.output, error: r.error, executionId: r.executionId, tool: r.tool, renders: r.renders, sources: r.sources, kind: r.kind, rowCount: r.rowCount, policy: r.policy ? { decision: r.policy.decision, reason: r.policy.reason } : null };
    },
    emit: async () => {},
    log: () => {},
  };
  const { plan: done } = await runPlan(plan, ctx);
  const failed = done.steps.filter((st) => st.status === "failed");
  if (failed.length) return { status: "failed", error: failed.map((st) => `${st.key}: ${st.error ?? ""}`).join(" / ") };
  return { status: done.status === "waiting_approval" ? "needs_approval" : "ok" };
}

/** ai_action_queue の行（__core 付き、または Tool 名の action_type）を Tool として実行する（承認済み・取消枠経過後） */
export async function runQueuedTool(admin: Admin, row: { company_id: string; action_type: string; payload: Record<string, unknown>; created_by: string | null; id: string }): Promise<Record<string, unknown>> {
  const core = getCore();
  const ref = typeof row.payload.tool === "string" ? String(row.payload.tool) : row.action_type;
  if (!core.registry.has(ref)) throw new Error(`Tool 未登録: ${ref}`);
  const input = (row.payload.__core ? (row.payload.input as Record<string, unknown>) : stripLegacyPayload(row.payload)) ?? {};
  const actor: CoreActor = await coreActorFromStaffId(admin, row.company_id, row.created_by);
  const context = await buildGenesisContext(admin, actor, row.company_id, { surface: "web", storeId: typeof input.store_id === "string" ? input.store_id : null, enrich: false });
  const r = await executeTool({ registry: core.registry, admin, context, ref, input, policy: await loadPolicySet(admin, row.company_id), catalog: core.catalog, origin: "ai_action_queue", force: true });
  if (r.status === "ok" || r.status === "idempotent") return { ...(r.output ?? {}), execution_id: r.executionId, tool: r.tool, sources: r.sources };
  throw new Error(`${r.tool}: ${r.status}${r.error ? " — " + r.error : ""}`);
}

/** JARVIS 由来の旧 payload（_said など）を Tool の input に落とす */
function stripLegacyPayload(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!k.startsWith("_") && k !== "tool" && v !== null && v !== undefined) out[k] = v;
  return out;
}
