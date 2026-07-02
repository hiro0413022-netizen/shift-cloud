"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export type RequestEntry = { date: string; template_id: string | null; memo: string };

/**
 * シフト提出（一括）
 * 提出内容はそのままドラフトシフトになり、管理者が確認・確定する（承認制）。
 */
export async function submitRequests(periodId: string, entries: RequestEntry[]): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: period } = await admin
    .from("shift_request_periods")
    .select("id, status, deadline, store_id")
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

  if (rows.length === 0) return { error: "提出するシフトがありません" };

  const { error } = await admin
    .from("shift_requests")
    .upsert(rows, { onConflict: "period_id,staff_id,date" });
  if (error) return { error: error.message };

  // 提出内容をドラフトシフトとして自動作成（確定済みの日は変更しない）
  const storeId = period.store_id ?? actor.primaryStoreId ?? actor.storeIds[0];
  if (storeId) {
    const templateIds = [...new Set(rows.map((r) => r.template_id).filter(Boolean))] as string[];
    const dates = rows.map((r) => r.date);

    const [{ data: templates }, { data: existing }] = await Promise.all([
      templateIds.length
        ? admin.from("shift_templates").select("id, start_time, end_time, is_day_off").in("id", templateIds)
        : Promise.resolve({ data: [] as { id: string; start_time: string | null; end_time: string | null; is_day_off: boolean }[] }),
      admin.from("shifts").select("date, status")
        .eq("staff_id", actor.staffId).eq("store_id", storeId).in("date", dates).is("deleted_at", null),
    ]);
    const tmap = new Map((templates ?? []).map((t) => [t.id, t]));
    const publishedDates = new Set((existing ?? []).filter((s) => s.status === "published").map((s) => s.date));

    const drafts = rows
      .filter((r) => r.template_id && !publishedDates.has(r.date))
      .map((r) => {
        const t = tmap.get(r.template_id!);
        if (!t) return null;
        return {
          company_id: actor.companyId,
          staff_id: actor.staffId,
          store_id: storeId,
          date: r.date,
          template_id: r.template_id,
          start_time: t.start_time,
          end_time: t.end_time,
          is_day_off: t.is_day_off,
          status: "draft" as const,
          published_at: null,
          deleted_at: null,
        };
      })
      .filter(Boolean);

    if (drafts.length) {
      await admin.from("shifts").upsert(drafts as Record<string, unknown>[], { onConflict: "staff_id,store_id,date" });
    }
  }

  await logAudit(actor, "shift_request.submit", "shift_requests", null, null, { periodId, count: rows.length });
  revalidatePath("/requests");
  return {};
}

/** 出勤募集に応募する */
export async function applyHelp(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const admin = createAdmin();
  const helpRequestId = String(formData.get("help_request_id"));

  const { data: hr } = await admin.from("help_requests")
    .select("id, status")
    .eq("id", helpRequestId).eq("company_id", actor.companyId)
    .is("deleted_at", null).maybeSingle();
  if (!hr || hr.status !== "open") return;

  await admin.from("help_applications").upsert(
    {
      company_id: actor.companyId,
      help_request_id: helpRequestId,
      staff_id: actor.staffId,
      status: "pending",
    },
    { onConflict: "help_request_id,staff_id" }
  );
  await logAudit(actor, "help.apply", "help_applications", null, null, { helpRequestId });
  revalidatePath("/requests");
}
