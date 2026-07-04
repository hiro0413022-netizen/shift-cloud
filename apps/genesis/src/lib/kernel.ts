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
