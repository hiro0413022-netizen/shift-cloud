/**
 * Policy Engine（Final Architecture §7）
 *
 * Tool × Role(permission) × Store × Amount × Context × Risk → 1つの decision。
 * 順番は固定。早い段階の deny は後段で覆らない。AI は代理元の人の権限を絶対に超えない。
 *
 * decision:
 *   allow      … すぐ実行（ログのみ）
 *   auto_undo  … 実行するが undoMinutes の取消枠を置く（ai_action_queue 経由）
 *   approval   … 人の承認を待つ
 *   two_step   … 承認＋金額/宛先の再表示（Level 4）
 *   deny       … 実行しない（理由つき・Dashboard の Permission Denied に数える）
 */
import type { ToolContract, RiskLevel } from "./tool.ts";
import { effectiveActor, type GenesisContext } from "./context.ts";

export type Decision = "allow" | "auto_undo" | "approval" | "two_step" | "deny";

export type PolicyResult = {
  decision: Decision;
  reason: string;
  /** どの段で決まったか（permission / scope / tool_rule / amount / context / risk） */
  stage: string;
  undoMinutes: number;
};

/** gn_tool_policies の1行（テナントごとの Tool 固有ルール） */
export type ToolRule = {
  tool: string; // 'shift.publish'（version 無し＝全版）または 'shift.publish@1'
  /** いずれかを持つ人だけ。空＝Tool 既定の permission のまま */
  requirePermissions?: string[];
  /** この店舗でだけ使える。空＝制限なし */
  storeIds?: string[];
  /** これを超える金額は approval に格上げ */
  maxAmount?: number | null;
  /** 既定モードの上書き（allow / auto_undo / approval / two_step / deny） */
  mode?: Decision | null;
  undoMinutes?: number | null;
};

export type PolicySet = {
  rules: ToolRule[];
  /** 既存 ai_execution_policies（action_type = tool 名）による上書き。auto→allow, auto_undo, approval */
  legacyModes?: Record<string, { mode: "auto" | "auto_undo" | "approval"; undoMinutes: number }>;
  /** 営業時間外の送信を approval にする時間帯（JST の時）。既定 22〜7 */
  quietHours?: { from: number; to: number };
};

export const EMPTY_POLICY: PolicySet = { rules: [] };

/** Risk Level → 既定モード */
export function defaultDecision(risk: RiskLevel): { decision: Decision; undoMinutes: number } {
  switch (risk) {
    case 0:
    case 1:
      return { decision: "allow", undoMinutes: 0 };
    case 2:
      return { decision: "auto_undo", undoMinutes: 5 };
    case 3:
      return { decision: "approval", undoMinutes: 0 };
    default:
      return { decision: "two_step", undoMinutes: 0 };
  }
}

const ORDER: Record<Decision, number> = { allow: 0, auto_undo: 1, approval: 2, two_step: 3, deny: 4 };

/** 厳しい方を取る（格上げはできても格下げはできない） */
export function stricter(a: Decision, b: Decision): Decision {
  return ORDER[a] >= ORDER[b] ? a : b;
}

function ruleMatches(rule: ToolRule, tool: ToolContract): boolean {
  if (rule.tool === tool.name) return true;
  return rule.tool === `${tool.name}@${tool.version}`;
}

export function evaluatePolicy(args: {
  tool: ToolContract;
  input: Record<string, unknown>;
  context: GenesisContext;
  policy?: PolicySet;
}): PolicyResult {
  const { tool, input, context } = args;
  const policy = args.policy ?? EMPTY_POLICY;
  const actor = effectiveActor(context.actor);
  const perms = new Set(actor.permissions);
  const readOnly = perms.has("read_only");

  // 1) Tool permission（オーナーは常に可。read_only は書き込み Tool 不可）
  if (!actor.isOwner) {
    if (tool.permission.length && !tool.permission.some((p) => perms.has(p))) {
      return { decision: "deny", reason: `権限不足: ${tool.permission.join(" / ")} のいずれかが必要`, stage: "permission", undoMinutes: 0 };
    }
    if (readOnly && tool.risk >= 2) {
      return { decision: "deny", reason: "閲覧専用ロールでは更新できません", stage: "permission", undoMinutes: 0 };
    }
  }

  // 2) Store scope（id 直打ちで抜けないよう input.store_id をサーバー側で検証・#134）
  if (tool.scope === "store" && !actor.isOwner) {
    const storeId = typeof input.store_id === "string" ? input.store_id : actor.primaryStoreId;
    if (!storeId || !actor.storeIds.includes(storeId)) {
      return { decision: "deny", reason: "所属店舗の外です", stage: "scope", undoMinutes: 0 };
    }
  }

  const base = defaultDecision(tool.risk);
  let decision = base.decision;
  let undoMinutes = base.undoMinutes;
  let stage = "risk";
  let reason = `risk ${tool.risk} の既定`;

  // 3) Tool 固有ルール（テナント）
  for (const rule of policy.rules.filter((r) => ruleMatches(r, tool))) {
    if (rule.requirePermissions?.length && !actor.isOwner && !rule.requirePermissions.some((p) => perms.has(p))) {
      return { decision: "deny", reason: `この操作は ${rule.requirePermissions.join(" / ")} を持つ人だけ`, stage: "tool_rule", undoMinutes: 0 };
    }
    if (rule.storeIds?.length && !actor.isOwner) {
      const storeId = typeof input.store_id === "string" ? input.store_id : actor.primaryStoreId;
      if (!storeId || !rule.storeIds.includes(storeId)) {
        return { decision: "deny", reason: "この店舗では許可されていません", stage: "tool_rule", undoMinutes: 0 };
      }
    }
    if (rule.mode) {
      decision = rule.mode;
      undoMinutes = rule.undoMinutes ?? undoMinutes;
      stage = "tool_rule";
      reason = `テナントルール: ${rule.mode}`;
    }
    // 4) Amount
    if (rule.maxAmount != null && tool.amount) {
      const amt = tool.amount(input);
      if (amt != null && amt > rule.maxAmount) {
        decision = stricter(decision, "approval");
        stage = "amount";
        reason = `金額 ${amt.toLocaleString()} が上限 ${rule.maxAmount.toLocaleString()} を超える`;
      }
    }
  }

  // 既存 ai_execution_policies（#61）の上書き。Tool ルールが無いときだけ効かせる
  const legacy = policy.legacyModes?.[tool.name];
  if (legacy && stage === "risk") {
    decision = legacy.mode === "auto" ? "allow" : legacy.mode;
    undoMinutes = legacy.mode === "auto_undo" ? legacy.undoMinutes : 0;
    stage = "legacy_policy";
    reason = `ai_execution_policies: ${legacy.mode}`;
  }

  // 5) Context
  if (context.surface === "mcp" && tool.risk >= 3) {
    decision = stricter(decision, "approval");
    stage = "context";
    reason = "MCP 経由の送信・課金は必ず承認";
  }
  if (tool.risk === 3) {
    const q = policy.quietHours ?? { from: 22, to: 7 };
    const h = context.time.jstHour;
    const quiet = q.from > q.to ? h >= q.from || h < q.to : h >= q.from && h < q.to;
    if (quiet) {
      decision = stricter(decision, "approval");
      stage = "context";
      reason = "営業時間外の送信は承認";
    }
  }
  if (context.actor.kind === "ai" && !context.actor.onBehalfOf && tool.risk >= 2) {
    // 代理元の人が居ない AI（cron 起点）は、更新以上を承認に倒す
    decision = stricter(decision, "approval");
    stage = "context";
    reason = "代理元の人が居ない AI 実行は承認";
  }

  return { decision, reason, stage, undoMinutes };
}

/** DB の行 → PolicySet（gn_tool_policies / ai_execution_policies の両方を読む） */
export async function loadPolicySet(admin: import("./tool.ts").AdminLike, companyId: string): Promise<PolicySet> {
  const out: PolicySet = { rules: [], legacyModes: {} };
  try {
    const { data } = await admin
      .from("gn_tool_policies")
      .select("tool, require_permissions, store_ids, max_amount, mode, undo_minutes")
      .eq("company_id", companyId)
      .eq("enabled", true);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      out.rules.push({
        tool: String(r.tool),
        requirePermissions: (r.require_permissions as string[] | null) ?? [],
        storeIds: (r.store_ids as string[] | null) ?? [],
        maxAmount: r.max_amount == null ? null : Number(r.max_amount),
        mode: (r.mode as Decision | null) ?? null,
        undoMinutes: r.undo_minutes == null ? null : Number(r.undo_minutes),
      });
    }
  } catch {
    /* 未適用でも動く */
  }
  try {
    const { data } = await admin.from("ai_execution_policies").select("action_type, mode, undo_minutes").eq("company_id", companyId);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      out.legacyModes![String(r.action_type)] = { mode: r.mode as "auto" | "auto_undo" | "approval", undoMinutes: Number(r.undo_minutes ?? 0) };
    }
  } catch {
    /* noop */
  }
  return out;
}
