import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { Actor } from "@/lib/auth";

/** 全ミューテーションはこれで監査ログを残す（API_STANDARD） */
export async function logAudit(
  actor: Actor | null,
  action: string,
  tableName: string,
  recordId: string | null,
  before: unknown = null,
  after: unknown = null,
  companyId?: string
) {
  const admin = createAdmin();
  await admin.from("audit_logs").insert({
    company_id: actor?.companyId ?? companyId,
    actor_staff_id: actor?.staffId ?? null,
    actor_type: actor ? "human" : "system",
    action,
    table_name: tableName,
    record_id: recordId,
    before,
    after,
  });
}
