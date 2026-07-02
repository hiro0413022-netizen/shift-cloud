"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export type CellShift = {
  staff_id: string;
  date: string;
  template_id: string | null; // null = クリア
};

/** 募集期間を開く */
export async function openPeriod(formData: FormData) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const targetMonth = String(formData.get("target_month")) + "-01";
  const deadline = String(formData.get("deadline"));
  const { data } = await admin.from("shift_request_periods")
    .insert({ company_id: actor.companyId, target_month: targetMonth, deadline, status: "open" })
    .select("id").single();
  await logAudit(actor, "request_period.open", "shift_request_periods", data?.id ?? null, null, { targetMonth, deadline });
  revalidatePath("/admin/shifts");
}

export async function closePeriod(formData: FormData) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const id = String(formData.get("id"));
  await admin.from("shift_request_periods").update({ status: "closed" }).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "request_period.close", "shift_request_periods", id);
  revalidatePath("/admin/shifts");
}

/** ドラフト保存（グリッド全体を反映） */
export async function saveDraft(storeId: string, cells: CellShift[]): Promise<{ error?: string }> {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();

  const { data: templates } = await admin.from("shift_templates")
    .select("id, start_time, end_time, is_day_off")
    .eq("company_id", actor.companyId);
  const tmap = new Map((templates ?? []).map((t) => [t.id, t]));

  for (const c of cells) {
    if (!c.template_id) {
      // クリア: draftのみ削除（published は publish解除しない）
      await admin.from("shifts").delete()
        .eq("staff_id", c.staff_id).eq("store_id", storeId).eq("date", c.date).eq("status", "draft");
      continue;
    }
    const t = tmap.get(c.template_id);
    if (!t) continue;
    const { error } = await admin.from("shifts").upsert(
      {
        company_id: actor.companyId,
        staff_id: c.staff_id,
        store_id: storeId,
        date: c.date,
        template_id: c.template_id,
        start_time: t.start_time,
        end_time: t.end_time,
        is_day_off: t.is_day_off,
        status: "draft",
        published_at: null,
        deleted_at: null,
      },
      { onConflict: "staff_id,store_id,date" }
    );
    if (error) return { error: error.message };
  }

  await logAudit(actor, "shifts.save_draft", "shifts", null, null, { storeId, count: cells.length });
  revalidatePath("/admin/shifts");
  return {};
}

/** 対象月の全ドラフトを確定し、スタッフへ通知 */
export async function publishShifts(storeId: string, ym: string): Promise<{ error?: string; published?: number }> {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const from = `${ym}-01`, to = `${ym}-31`;

  const { data: drafts } = await admin.from("shifts")
    .select("id, staff_id")
    .eq("company_id", actor.companyId).eq("store_id", storeId)
    .eq("status", "draft").is("deleted_at", null)
    .gte("date", from).lte("date", to);

  if (!drafts?.length) return { error: "確定対象のドラフトがありません" };

  const { error } = await admin.from("shifts")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("company_id", actor.companyId).eq("store_id", storeId)
    .eq("status", "draft").gte("date", from).lte("date", to);
  if (error) return { error: error.message };

  // スタッフへ通知
  const staffIds = [...new Set(drafts.map((d) => d.staff_id))];
  const [y, m] = ym.split("-");
  await admin.from("notifications").insert(
    staffIds.map((sid) => ({
      company_id: actor.companyId,
      staff_id: sid,
      kind: "shift_published",
      title: `${y}年${Number(m)}月のシフトが確定しました`,
      body: "シフト画面から確認してください。",
      link: "/shifts",
    }))
  );

  await logAudit(actor, "shifts.publish", "shifts", null, null, { storeId, ym, count: drafts.length });
  revalidatePath("/admin/shifts");
  return { published: drafts.length };
}
