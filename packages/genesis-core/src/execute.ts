/**
 * Action Engine（Final Architecture §1 / Proposal 5章）
 *
 * executeTool() が唯一の実行口。順番は固定:
 *   resolve → input 検証 → Policy → (承認待ちならここで返す) → rateLimit → idempotency → impl → output 検証 → verify → 記録
 * 「成功した前提」にしない: verify が false なら verify_failed として残し、tool.failed を発行する。
 * すべての結果は gn_tool_executions に1行（Dashboard の正典）。
 *
 * 承認が要る decision（auto_undo / approval / two_step）は **ここでは実行しない**。
 * 呼び出し側（apps/genesis）が既存の ai_action_queue に積み、承認・取消枠を経て force:true で戻ってくる。
 * これで #61/#186 の承認UI・取消UI・監査ログをそのまま使う。
 */
import { validate } from "./schema.ts";
import type { ToolContract, ToolCtx, ToolOutput, AdminLike, SourceRef } from "./tool.ts";
import type { ToolRegistry } from "./registry.ts";
import { evaluatePolicy, type PolicySet, type PolicyResult } from "./policy.ts";
import { emitEvent, type EventCatalog } from "./events.ts";
import type { GenesisContext } from "./context.ts";
import { effectiveActor } from "./context.ts";

export type ExecutionStatus =
  | "ok"
  | "idempotent"
  | "needs_approval"
  | "denied"
  | "failed"
  | "verify_failed"
  | "invalid_input"
  | "unknown_tool";

export type ExecutionResult = {
  status: ExecutionStatus;
  executionId: string | null;
  tool: string; // 'booking.create@1'
  output: Record<string, unknown> | null;
  sources: SourceRef[];
  kind: "fact" | "calculated" | "inference" | "suggestion";
  rowCount: number | null;
  silentZero: boolean;
  policy: PolicyResult | null;
  error: string | null;
  durationMs: number;
  logs: Array<{ message: string; data?: Record<string, unknown> }>;
  renders: string | null;
};

export type ExecuteArgs = {
  registry: ToolRegistry;
  admin: AdminLike;
  context: GenesisContext;
  ref: string;
  input: Record<string, unknown>;
  policy?: PolicySet;
  catalog?: EventCatalog;
  /** 承認済み・取消枠経過後の実行。Policy 判定は記録するが止めない */
  force?: boolean;
  planId?: string | null;
  stepId?: string | null;
  /** どこから呼ばれたか（'jarvis' / 'ai_action_queue' / 'api' / 'mcp' / 'cron'） */
  origin?: string | null;
  /** 再帰呼び出し（ctx.call）の深さ。Skill の暴走防止 */
  depth?: number;
};

const MAX_DEPTH = 4;

function norm(out: ToolOutput | Record<string, unknown>): ToolOutput {
  if (out && typeof out === "object" && "data" in out && typeof (out as ToolOutput).data === "object") return out as ToolOutput;
  return { data: out as Record<string, unknown> };
}

async function insertRow(admin: AdminLike, row: Record<string, unknown>): Promise<{ id: string | null; conflict: boolean }> {
  const { data, error } = await admin.from("gn_tool_executions").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") return { id: null, conflict: true };
    throw new Error(`gn_tool_executions insert 失敗: ${error.message}`);
  }
  return { id: data?.id ? String(data.id) : null, conflict: false };
}

export async function executeTool(args: ExecuteArgs): Promise<ExecutionResult> {
  const started = Date.now();
  const { registry, admin, context, input } = args;
  const depth = args.depth ?? 0;
  const actor = effectiveActor(context.actor);
  const logs: ExecutionResult["logs"] = [];
  const base = (over: Partial<ExecutionResult>): ExecutionResult => ({
    status: "failed",
    executionId: null,
    tool: args.ref,
    output: null,
    sources: [],
    kind: "fact",
    rowCount: null,
    silentZero: false,
    policy: null,
    error: null,
    durationMs: Date.now() - started,
    logs,
    renders: null,
    ...over,
  });

  const rowBase = {
    company_id: context.company.id,
    store_id: context.store?.id ?? (typeof input.store_id === "string" ? input.store_id : null),
    actor_staff_id: actor.staffId,
    actor_kind: context.actor.kind,
    surface: context.surface,
    origin: args.origin ?? null,
    plan_id: args.planId ?? null,
    step_id: args.stepId ?? null,
    input,
  };

  if (depth > MAX_DEPTH) return base({ status: "failed", error: `Tool の再帰呼び出しが深すぎます（>${MAX_DEPTH}）` });

  // 1) resolve — 一覧に無い操作は実行しない（AIが思いついた操作名でDBを書き換えさせない）
  let tool: ToolContract | null;
  try {
    tool = registry.resolve(args.ref);
  } catch (e) {
    tool = null;
    logs.push({ message: e instanceof Error ? e.message : String(e) });
  }
  if (!tool) {
    await insertRow(admin, { ...rowBase, tool_name: args.ref, tool_version: 0, risk: 0, status: "unknown_tool", error: "未登録の Tool", duration_ms: Date.now() - started }).catch(() => null);
    return base({ status: "unknown_tool", error: `未登録の Tool: ${args.ref}` });
  }
  const ref = `${tool.name}@${tool.version}`;
  const rowTool = { tool_name: tool.name, tool_version: tool.version, risk: tool.risk };

  // 2) input 検証
  const v = validate<Record<string, unknown>>(tool.input, input);
  if (!v.ok) {
    const error = v.errors.join(" / ");
    const r = await insertRow(admin, { ...rowBase, ...rowTool, status: "invalid_input", error, duration_ms: Date.now() - started }).catch(() => ({ id: null }));
    return base({ status: "invalid_input", tool: ref, error, executionId: r.id ?? null, renders: tool.renders });
  }
  const cleanInput = v.value;

  // 3) Policy
  const policy = evaluatePolicy({ tool, input: cleanInput, context, policy: args.policy });
  if (policy.decision === "deny") {
    const r = await insertRow(admin, { ...rowBase, ...rowTool, input: cleanInput, status: "denied", policy_decision: policy.decision, policy_stage: policy.stage, error: policy.reason, duration_ms: Date.now() - started }).catch(() => ({ id: null }));
    return base({ status: "denied", tool: ref, policy, error: policy.reason, executionId: r.id ?? null, renders: tool.renders });
  }
  if (policy.decision !== "allow" && !args.force) {
    const r = await insertRow(admin, { ...rowBase, ...rowTool, input: cleanInput, status: "needs_approval", policy_decision: policy.decision, policy_stage: policy.stage, error: null, duration_ms: Date.now() - started }).catch(() => ({ id: null }));
    return base({ status: "needs_approval", tool: ref, policy, executionId: r.id ?? null, renders: tool.renders });
  }

  // 4) rateLimit（同じ人・同じ Tool・直近1分）
  try {
    const since = new Date(Date.now() - 60_000).toISOString();
    let q = admin
      .from("gn_tool_executions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", context.company.id)
      .eq("tool_name", tool.name)
      .in("status", ["ok", "running"])
      .gte("created_at", since);
    q = actor.staffId ? q.eq("actor_staff_id", actor.staffId) : q.is("actor_staff_id", null);
    const { count } = await q;
    if ((count ?? 0) >= tool.rateLimit.perMinute) {
      const error = `rateLimit 超過（${tool.rateLimit.perMinute}/分）`;
      const r = await insertRow(admin, { ...rowBase, ...rowTool, input: cleanInput, status: "denied", policy_decision: policy.decision, policy_stage: "rate_limit", error, duration_ms: Date.now() - started }).catch(() => ({ id: null }));
      return base({ status: "denied", tool: ref, policy: { ...policy, decision: "deny", stage: "rate_limit", reason: error }, error, executionId: r.id ?? null, renders: tool.renders });
    }
  } catch {
    /* 計測できなくても実行は止めない */
  }

  // 5) idempotency — running 行を先に取る。一意制約に当たった＝同じ鍵の実行が既にある
  const idemKey = tool.idempotency(cleanInput as never, context);
  const ins = await insertRow(admin, { ...rowBase, ...rowTool, input: cleanInput, status: "running", policy_decision: policy.decision, policy_stage: policy.stage, idempotency_key: idemKey });
  if (ins.conflict) {
    const { data: prev } = await admin
      .from("gn_tool_executions")
      .select("id, status, output, sources, row_count")
      .eq("company_id", context.company.id)
      .eq("tool_name", tool.name)
      .eq("idempotency_key", idemKey)
      .in("status", ["ok", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prev?.status === "ok") {
      return base({ status: "idempotent", tool: ref, output: (prev.output as Record<string, unknown>) ?? null, sources: (prev.sources as SourceRef[]) ?? [], rowCount: prev.row_count ?? null, policy, executionId: String(prev.id), renders: tool.renders });
    }
    return base({ status: "failed", tool: ref, policy, error: "同じ操作が実行中です（二重実行を防ぎました）", executionId: prev?.id ? String(prev.id) : null, renders: tool.renders });
  }
  const executionId = ins.id;

  const finish = async (patch: Record<string, unknown>) => {
    if (!executionId) return;
    await admin.from("gn_tool_executions").update({ ...patch, duration_ms: Date.now() - started, logs }).eq("id", executionId).then(() => null, () => null);
  };

  const ctx: ToolCtx = {
    admin,
    context,
    call: async (r, i) => {
      const res = await executeTool({ ...args, ref: r, input: i, depth: depth + 1, origin: `${ref}` });
      return { status: res.status, output: res.output, error: res.error };
    },
    emit: async (type, version, payload, entity) => {
      await emitEvent(
        admin,
        {
          type,
          version,
          companyId: context.company.id,
          storeId: context.store?.id ?? (typeof cleanInput.store_id === "string" ? cleanInput.store_id : null),
          entity: entity ?? null,
          payload,
          actor: { kind: context.actor.kind, staffId: actor.staffId },
          source: ref,
        },
        args.catalog
      );
    },
    log: (message, data) => logs.push({ message, data }),
  };

  // 6) impl
  let out: ToolOutput;
  try {
    out = norm(await tool.impl(cleanInput as never, ctx));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finish({ status: "failed", error });
    await ctx.emit("tool.failed", 1, { tool: ref, error, execution_id: executionId ?? "", summary: `${ref} が失敗: ${error}` }).catch(() => null);
    return base({ status: "failed", tool: ref, policy, error, executionId, renders: tool.renders });
  }

  // 7) output 検証
  const ov = validate<Record<string, unknown>>(tool.output, out.data);
  if (!ov.ok) {
    const error = `output が形に合いません: ${ov.errors.join(" / ")}`;
    await finish({ status: "failed", error, output: out.data });
    return base({ status: "failed", tool: ref, policy, error, executionId, output: out.data, renders: tool.renders });
  }

  // 8) verify — 成功した前提にしない
  if (tool.verify) {
    let verified = false;
    try {
      verified = await tool.verify(ov.value as never, ctx);
    } catch (e) {
      logs.push({ message: `verify 例外: ${e instanceof Error ? e.message : String(e)}` });
    }
    if (!verified) {
      const error = "verify に失敗（書いたはずの結果が確認できない）";
      await finish({ status: "verify_failed", error, output: ov.value, sources: out.sources ?? [] });
      await ctx.emit("tool.failed", 1, { tool: ref, error, execution_id: executionId ?? "", summary: `${ref}: ${error}` }).catch(() => null);
      return base({ status: "verify_failed", tool: ref, policy, error, executionId, output: ov.value, sources: out.sources ?? [], renders: tool.renders });
    }
  }

  // 9) 黙って0件の検知（読み Tool）
  const rowCount = out.rowCount ?? null;
  const silentZero = tool.minRows !== undefined && rowCount !== null && rowCount < tool.minRows;
  if (silentZero) {
    await ctx.emit("tool.silent_zero", 1, { tool: ref, rows: rowCount ?? 0, min_rows: tool.minRows ?? 0, summary: `${ref} が ${rowCount} 件（期待下限 ${tool.minRows}）` }).catch(() => null);
  }

  await finish({ status: "ok", output: ov.value, sources: out.sources ?? [], row_count: rowCount, silent_zero: silentZero, fact_kind: out.kind ?? "fact" });
  return base({
    status: "ok",
    tool: ref,
    policy,
    executionId,
    output: ov.value,
    sources: out.sources ?? [],
    kind: out.kind ?? "fact",
    rowCount,
    silentZero,
    renders: tool.renders,
  });
}

/** 実行済み Tool の取り消し（Level 2 の Undo）。undo の実行自体も1行として残す */
export async function undoExecution(args: { registry: ToolRegistry; admin: AdminLike; context: GenesisContext; executionId: string; catalog?: EventCatalog }): Promise<{ ok: boolean; error?: string }> {
  const { admin, registry, context } = args;
  const { data: row } = await admin.from("gn_tool_executions").select("*").eq("id", args.executionId).eq("company_id", context.company.id).maybeSingle();
  if (!row) return { ok: false, error: "実行記録が見つかりません" };
  if (row.status !== "ok") return { ok: false, error: `取り消せる状態ではありません（${row.status}）` };
  if (row.undone_at) return { ok: false, error: "既に取り消し済み" };
  const tool = registry.resolve(`${row.tool_name}@${row.tool_version}`);
  if (!tool?.undo) return { ok: false, error: "この Tool は取り消しに対応していません" };
  const actor = effectiveActor(context.actor);
  const logs: ExecutionResult["logs"] = [];
  const ctx: ToolCtx = {
    admin,
    context,
    call: async (r, i) => {
      const res = await executeTool({ registry, admin, context, ref: r, input: i, catalog: args.catalog, force: true, origin: `undo:${row.tool_name}@${row.tool_version}` });
      return { status: res.status, output: res.output, error: res.error };
    },
    emit: async (type, version, payload, entity) => {
      await emitEvent(admin, { type, version, companyId: context.company.id, storeId: row.store_id ?? null, entity: entity ?? null, payload, actor: { kind: context.actor.kind, staffId: actor.staffId }, source: `undo:${row.tool_name}@${row.tool_version}` }, args.catalog);
    },
    log: (message, data) => logs.push({ message, data }),
  };
  try {
    await tool.undo(row.output as never, ctx);
    await admin.from("gn_tool_executions").update({ undone_at: new Date().toISOString(), undone_by: actor.staffId }).eq("id", args.executionId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
