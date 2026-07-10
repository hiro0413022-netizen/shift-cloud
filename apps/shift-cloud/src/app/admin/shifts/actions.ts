"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export type CellShift = {
  staff_id: string;
  date: string;
  template_id: string | null;          // null = クリア または 任意時刻
  start_time?: string | null;          // 任意時刻（テンプレ未使用時）"HH:MM"
  end_time?: string | null;
};

/** period_type + 対象月から募集期間の範囲を算出 */
function computeRange(periodType: string, ym: string, startRaw: string, endRaw: string) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const p2 = (n: number) => String(n).padStart(2, "0");
  switch (periodType) {
    case "half1": return { start: `${ym}-01`, end: `${ym}-15` };
    case "half2": return { start: `${ym}-16`, end: `${ym}-${p2(lastDay)}` };
    case "custom": return { start: startRaw, end: endRaw };
    case "month":
    default:       return { start: `${ym}-01`, end: `${ym}-${p2(lastDay)}` };
  }
}

/** 募集期間を開く（月 / 前半 / 後半 / 任意期間） */
export async function openPeriod(formData: FormData) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const periodType = String(formData.get("period_type") || "month");
  const ym = String(formData.get("target_month"));
  const { start, end } = computeRange(
    periodType, ym,
    String(formData.get("start_date") || `${ym}-01`),
    String(formData.get("end_date") || `${ym}-01`),
  );
  const deadline = String(formData.get("deadline"));
  const title = String(formData.get("title") || "") || null;
  const { data } = await admin.from("shift_request_periods")
    .insert({
      company_id: actor.companyId,
      store_id: String(formData.get("store_id") || "") || null,
      target_month: `${start.slice(0, 7)}-01`,
      period_type: periodType,
      start_date: start,
      end_date: end,
      title,
      deadline,
      status: "open",
    })
    .select("id").single();
  await logAudit(actor, "request_period.open", "shift_request_periods", data?.id ?? null, null, { periodType, start, end, deadline });
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

/** ④ 締め切りを取り消して募集中に戻す */
export async function reopenPeriod(formData: FormData) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const id = String(formData.get("id"));
  await admin.from("shift_request_periods").update({ status: "open" }).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "request_period.reopen", "shift_request_periods", id);
  revalidatePath("/admin/shifts");
}

/** ⑤ 募集期間を削除（ソフト削除。紐づく提出希望もまとめて削除） */
export async function deletePeriod(formData: FormData) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const id = String(formData.get("id"));
  const now = new Date().toISOString();

  // 対象期間が自社のものか確認
  const { data: period } = await admin.from("shift_request_periods")
    .select("id").eq("id", id).eq("company_id", actor.companyId).is("deleted_at", null).single();
  if (!period) return;

  // 紐づく提出希望の件数を先に取得（監査ログ用）
  const { count } = await admin.from("shift_requests")
    .select("*", { count: "exact", head: true })
    .eq("period_id", id).is("deleted_at", null);

  // 紐づく提出希望をソフト削除
  await admin.from("shift_requests")
    .update({ deleted_at: now }).eq("period_id", id).is("deleted_at", null);

  // 期間本体をソフト削除
  await admin.from("shift_request_periods")
    .update({ deleted_at: now }).eq("id", id).eq("company_id", actor.companyId);

  await logAudit(actor, "request_period.delete", "shift_request_periods", id, null, { requestsDeleted: count ?? 0 });
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
    // テンプレも任意時刻も無い → クリア（draftのみ削除。published は解除しない）
    if (!c.template_id && !(c.start_time && c.end_time)) {
      await admin.from("shifts").delete()
        .eq("staff_id", c.staff_id).eq("store_id", storeId).eq("date", c.date).eq("status", "draft");
      continue;
    }
    // 任意時刻（テンプレ未使用）
    let start_time: string | null, end_time: string | null, is_day_off: boolean;
    if (c.template_id) {
      const t = tmap.get(c.template_id);
      if (!t) continue;
      start_time = t.start_time; end_time = t.end_time; is_day_off = t.is_day_off;
    } else {
      start_time = c.start_time ?? null; end_time = c.end_time ?? null; is_day_off = false;
    }
    const { error } = await admin.from("shifts").upsert(
      {
        company_id: actor.companyId,
        staff_id: c.staff_id,
        store_id: storeId,
        date: c.date,
        template_id: c.template_id,
        start_time,
        end_time,
        is_day_off,
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

/** 対象期間の全ドラフトを確定し、スタッフへ通知 */
export async function publishShifts(storeId: string, from: string, to: string): Promise<{ error?: string; published?: number }> {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();

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
  const [y, m] = from.split("-");
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const rangeLabel = sameMonth
    ? `${y}年${Number(m)}月`
    : `${Number(from.slice(5, 7))}/${Number(from.slice(8))}〜${Number(to.slice(5, 7))}/${Number(to.slice(8))}`;
  await admin.from("notifications").insert(
    staffIds.map((sid) => ({
      company_id: actor.companyId,
      staff_id: sid,
      kind: "shift_published",
      title: `${rangeLabel}のシフトが確定しました`,
      body: "シフト画面から確認してください。",
      link: "/shifts",
    }))
  );

  await logAudit(actor, "shifts.publish", "shifts", null, null, { storeId, from, to, count: drafts.length });
  revalidatePath("/admin/shifts");
  return { published: drafts.length };
}
