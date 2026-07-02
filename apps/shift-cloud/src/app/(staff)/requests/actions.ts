"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export type RequestEntry = { date: string; template_id: string | null; memo: string };

/** シフト希望の一括提出（既存はupsertで上書き） */
export async function submitRequests(periodId: string, entries: RequestEntry[]): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: period } = await admin
    .from("shift_request_periods")
    .select("id, status, deadline")
    .eq("id", periodId)
    .eq("company_id", actor.companyId)
    .single();
  if (!period || period.status !== "open") return { error: "この募集期間は締め切られています" };

  const rows = entries
    .filter((e) => e.template_id || e.memo)
    .map((e) => ({
      company_id: actor.companyId,
      period_id: periodId,
      staff_id: actor.staffId,
      date: e.date,
      template_id: e.template_id,
      memo: e.memo || null,
      status: "submitted" as const,
    }));

  if (rows.length === 0) return { error: "提出する希望がありません" };

  const { error } = await admin
    .from("shift_requests")
    .upsert(rows, { onConflict: "period_id,staff_id,date" });
  if (error) return { error: error.message };

  await logAudit(actor, "shift_request.submit", "shift_requests", null, null, { periodId, count: rows.length });
  revalidatePath("/requests");
  return {};
}
