import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { GenesisActor } from "@/lib/auth";

/** すべての重要操作をCompany Eventに記録する（MASTER_PROMPT 3-5） */
export async function logEvent(
  companyId: string,
  input: {
    event_type: string;
    title: string;
    description?: string;
    source?: string;
    source_type?: "human" | "system" | "ai" | "external";
    severity?: "info" | "notice" | "warning" | "critical";
    status?: string;
    priority?: number;
    amount?: number;
    tags?: string[];
    related_module_id?: string | null;
    related_staff_id?: string | null;
    raw_payload?: unknown;
    ai_summary?: string;
    ai_next_action?: string;
    human_approval_required?: boolean;
  }
): Promise<string | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("company_events")
    .insert({ company_id: companyId, ...input })
    .select("id")
    .single();
  return data?.id ?? null;
}

/** 監査ログ（既存audit_logs再利用、DECISIONS #16） */
export async function logAudit(
  actor: GenesisActor,
  action: string,
  tableName: string,
  recordId: string | null,
  before: unknown = null,
  after: unknown = null
) {
  const admin = createAdmin();
  await admin.from("audit_logs").insert({
    company_id: actor.companyId,
    actor_staff_id: actor.staffId,
    actor_type: "human",
    action,
    table_name: tableName,
    record_id: recordId,
    before,
    after,
  });
}

export type CockpitData = {
  devStatuses: Record<string, unknown>[];
  risks: Record<string, unknown>[];
  blockers: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  agents: Record<string, unknown>[];
  modules: Record<string, unknown>[];
  recentEvents: Record<string, unknown>[];
  kpis: Record<string, unknown>[];
};

/** Cockpit/Command Center用の横断データ取得 */
export async function getCockpitData(companyId: string): Promise<CockpitData> {
  const admin = createAdmin();
  const [devStatuses, risks, blockers, approvals, agents, modules, recentEvents, kpis] =
    await Promise.all([
      admin.from("development_statuses").select("*").eq("company_id", companyId).is("deleted_at", null).order("progress"),
      admin.from("risks").select("*").eq("company_id", companyId).is("deleted_at", null).eq("status", "open").order("severity"),
      admin.from("blockers").select("*").eq("company_id", companyId).is("deleted_at", null).eq("status", "open"),
      admin.from("approval_requests").select("*").eq("company_id", companyId).eq("status", "pending").order("created_at", { ascending: false }).limit(20),
      admin.from("ai_agents").select("*").eq("company_id", companyId).is("deleted_at", null).order("code"),
      admin.from("modules").select("*").eq("company_id", companyId).is("deleted_at", null).order("sort_order"),
      admin.from("company_events").select("*").eq("company_id", companyId).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(15),
      admin.from("kpis").select("*").eq("company_id", companyId).is("deleted_at", null).order("code"),
    ]);
  return {
    devStatuses: devStatuses.data ?? [],
    risks: risks.data ?? [],
    blockers: blockers.data ?? [],
    approvals: approvals.data ?? [],
    agents: agents.data ?? [],
    modules: modules.data ?? [],
    recentEvents: recentEvents.data ?? [],
    kpis: kpis.data ?? [],
  };
}

/* ============================================================
   VISION準拠のCEO AIロジック（正典: docs/genesis/VISION.md）
   §5「YOZAN全体スコア」「今日の古川さんの判断リスト」§3「毎日出すもの」
   LLM不使用のルールベース（決定的・説明可能・クレジット消費ゼロ）
   ============================================================ */

/** VISION §6 最重要KPI 5つ（GOLF WINGの命） */
export const CORE_KPI_CODES = ["monthly_sales", "members", "trial_bookings", "churn_rate", "labor_cost_ratio"] as const;

/** 低いほど良いKPI（目標比の判定を反転） */
const LOWER_IS_BETTER = new Set(["churn_rate", "labor_cost_ratio", "labor_cost"]);

export type JudgmentItem = {
  kind: "approval" | "blocker" | "risk" | "kpi";
  title: string;
  detail?: string;
  href: string;
};

export type GenesisScore = {
  score: number; // 0-100
  grade: "good" | "watch" | "danger";
  factors: string[]; // 減点理由（説明可能性）
};

function kpiOf(d: CockpitData, code: string): Record<string, unknown> | undefined {
  return d.kpis.find((k) => k.code === code);
}

/** KPIが目標未達か（value/targetが揃っている場合のみ判定） */
function kpiMissTarget(k: Record<string, unknown>): boolean {
  if (k.current_value == null || k.target_value == null) return false;
  const v = Number(k.current_value);
  const t = Number(k.target_value);
  if (!Number.isFinite(v) || !Number.isFinite(t) || t === 0) return false;
  return LOWER_IS_BETTER.has(String(k.code)) ? v > t : v < t;
}

/** YOZAN全体スコア（VISION §5）: 100点から減点方式 */
export function computeGenesisScore(d: CockpitData): GenesisScore {
  let score = 100;
  const factors: string[] = [];

  if (d.blockers.length > 0) {
    score -= d.blockers.length * 10;
    factors.push(`ブロッカー${d.blockers.length}件 (-${d.blockers.length * 10})`);
  }
  const high = d.risks.filter((r) => ["high", "critical"].includes(String(r.severity))).length;
  const low = d.risks.length - high;
  if (high > 0) {
    score -= high * 6;
    factors.push(`高リスク${high}件 (-${high * 6})`);
  }
  if (low > 0) {
    score -= low * 2;
    factors.push(`リスク${low}件 (-${low * 2})`);
  }
  if (d.approvals.length > 0) {
    score -= d.approvals.length * 3;
    factors.push(`承認待ち${d.approvals.length}件 (-${d.approvals.length * 3})`);
  }

  let disconnected = 0;
  let missed = 0;
  for (const code of CORE_KPI_CODES) {
    const k = kpiOf(d, code);
    if (!k || k.current_value == null) disconnected++;
    else if (kpiMissTarget(k)) missed++;
  }
  if (disconnected > 0) {
    score -= disconnected * 4;
    factors.push(`5大KPI未接続${disconnected}件 (-${disconnected * 4})`);
  }
  if (missed > 0) {
    score -= missed * 8;
    factors.push(`5大KPI目標未達${missed}件 (-${missed * 8})`);
  }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? "good" : score >= 60 ? "watch" : "danger";
  return { score, grade, factors };
}

/** 今日の判断リスト（VISION §5）: 古川さんが今日決めるべきこと */
export function buildJudgmentList(d: CockpitData): JudgmentItem[] {
  const items: JudgmentItem[] = [];

  for (const a of d.approvals) {
    items.push({ kind: "approval", title: `承認判断: ${String(a.kind ?? "承認リクエスト")}`, href: "/approvals" });
  }
  for (const b of d.blockers) {
    items.push({
      kind: "blocker",
      title: `ブロッカー解消の指示: ${String(b.title)}`,
      detail: b.needs != null ? `解消条件: ${String(b.needs)}` : undefined,
      href: "/dev",
    });
  }
  for (const r of d.risks.filter((r) => ["high", "critical"].includes(String(r.severity)))) {
    items.push({ kind: "risk", title: `リスク対応の判断: ${String(r.title)}`, href: "/dev" });
  }
  for (const code of CORE_KPI_CODES) {
    const k = kpiOf(d, code);
    if (k && k.current_value != null && kpiMissTarget(k)) {
      items.push({
        kind: "kpi",
        title: `KPI目標未達への打ち手: ${String(k.name)}（${Number(k.current_value).toLocaleString("ja-JP")}${k.unit} / 目標${Number(k.target_value).toLocaleString("ja-JP")}${k.unit}）`,
        href: "/future",
      });
    }
  }
  // 未接続KPIの入力促し（最大2件、判断というより日課）
  const disconnected = CORE_KPI_CODES.filter((c) => {
    const k = kpiOf(d, c);
    return !k || k.current_value == null;
  }).slice(0, 2);
  for (const code of disconnected) {
    const k = kpiOf(d, code);
    items.push({
      kind: "kpi",
      title: `KPI入力/接続: ${String(k?.name ?? code)}`,
      detail: k?.notes != null ? String(k.notes) : undefined,
      href: code === "monthly_sales" ? "/finance" : "/command",
    });
  }
  return items;
}
