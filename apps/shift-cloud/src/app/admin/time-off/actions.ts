"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { eachDate } from "@/lib/shift-scope";

/**
 * 休み希望の承認・却下。
 * 承認したら、その期間のドラフトシフトを「休み」に置き換える。
 * 承認しただけでシフト側が勤務のまま残る = 一番やりたくない事故なので、ここで必ず反映する。
 */
export async function decideTimeOff(formData: FormData): Promise<void> {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")); // approved | rejected
  const note = String(formData.get("note") || "").trim() || null;
  if (decision !== "approved" && decision !== "rejected") return;

  const { data: row } = await admin.from("staff_time_off_requests")
    .select("id, staff_id, store_id, start_date, end_date, reason")
    .eq("id", id).eq("company_id", actor.companyId).is("deleted_at", null).maybeSingle();
  if (!row) return;

  await admin.from("staff_time_off_requests").update({
    status: decision,
    decided_by: actor.staffId,
    decided_at: new Date().toISOString(),
    decision_note: note,
  }).eq("id", id).eq("company_id", actor.companyId);

  if (decision === "approved") {
    const dates = eachDate(row.start_date, row.end_date);
    // 確定済み(published)のシフトは勝手に書き換えない。ドラフトだけ休みにする。
    const { data: existing } = await admin.from("shifts")
      .select("id, date, status").eq("staff_id", row.staff_id)
      .in("date", dates).is("deleted_at", null);
    const lockedDates = new Set((existing ?? []).filter((s) => s.status === "published").map((s) => s.date));

    const storeId = row.store_id;
    if (storeId) {
      const rows = dates.filter((d) => !lockedDates.has(d)).map((d) => ({
        company_id: actor.companyId,
        staff_id: row.staff_id,
        store_id: storeId,
        date: d,
        template_id: null,
        start_time: null,
        end_time: null,
        is_day_off: true,
        status: "draft" as const,
        published_at: null,
        note: row.reason,
        deleted_at: null,
      }));
      if (rows.length) {
        await admin.from("shifts").upsert(rows, { onConflict: "staff_id,store_id,date" });
      }
    }
  }

  await admin.from("notifications").insert({
    company_id: actor.companyId,
    staff_id: row.staff_id,
    kind: "time_off_decision",
    title: decision === "approved" ? "休み希望が承認されました" : "休み希望は見送りになりました",
    body: `${row.start_date}${row.end_date !== row.start_date ? `〜${row.end_date}` : ""}${note ? ` / ${note}` : ""}`,
    link: "/requests",
  });

  await logAudit(actor, `time_off.${decision}`, "staff_time_off_requests", id, null, {
    staffId: row.staff_id, start: row.start_date, end: row.end_date, note,
  });
  revalidatePath("/admin/time-off");
  revalidatePath("/admin/shifts");
}
