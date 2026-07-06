import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { ReceptionActor } from "@/lib/auth";

/** 重要操作をCompany Eventに記録する（Genesisと共通のcompany_eventsテーブル） */
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

/** 監査ログ（Genesisと共通のaudit_logsテーブル、DECISIONS #16） */
export async function logAudit(
  actor: ReceptionActor,
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
