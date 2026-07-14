"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { todayJST, currentYM } from "@/lib/util";

export async function decideSuggestion(formData: FormData) {
  const actor = await requireActor("approve_suggestions");
  const admin = createAdmin();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")); // approved | rejected
  await admin.from("ai_suggestions")
    .update({ approval_status: decision, decided_by: actor.staffId, decided_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, `suggestion.${decision}`, "ai_suggestions", id);
  revalidatePath("/hq/suggestions");
  revalidatePath("/hq");
}

/**
 * ルールベースのAI提案生成（AI_RULES.md: MVPは保存のみ・自動実行しない）
 * - 打刻漏れ検知 / 週間残業超過 / 希望未提出の締切接近
 */
export async function runSuggestionChecks() {
  const actor = await requireActor("view_hq");
  const admin = createAdmin();
  const ym = currentYM();
  const today = todayJST();

  // 既存のpending提案（重複防止用）
  const { data: existing } = await admin.from("ai_suggestions")
    .select("kind, staff_id, store_id").eq("company_id", actor.companyId).eq("approval_status", "pending");
  const dup = new Set((existing ?? []).map((e) => `${e.kind}|${e.staff_id}|${e.store_id}`));

  const inserts: Record<string, unknown>[] = [];

  // 1) 打刻漏れ
  const { data: missing } = await admin.from("attendance_days")
    .select("staff_id, store_id, date, staff(name), stores(name)")
    .eq("company_id", actor.companyId).eq("is_missing_clock", true)
    .gte("date", `${ym}-01`).lte("date", today);
  for (const m of missing ?? []) {
    if (dup.has(`missing_clock|${m.staff_id}|${m.store_id}`)) continue;
    dup.add(`missing_clock|${m.staff_id}|${m.store_id}`);
    inserts.push({
      company_id: actor.companyId,
      kind: "missing_clock",
      severity: "warning",
      store_id: m.store_id,
      staff_id: m.staff_id,
      title: `打刻漏れがあります（${(m.staff as unknown as { name?: string } | null)?.name ?? ""}）`,
      body: `${m.date} の打刻が不完全です。勤怠管理画面から修正してください。`,
      suggested_action: { type: "fix_attendance", params: { staff_id: m.staff_id, date: m.date } },
      source: "rule",
    });
  }

  // 2) 週間残業超過（今月合計 > 600分/10時間 で警告）
  const { data: ot } = await admin.from("attendance_days")
    .select("staff_id, store_id, overtime_minutes, staff(name)")
    .eq("company_id", actor.companyId).gte("date", `${ym}-01`).lte("date", today).gt("overtime_minutes", 0);
  const otByStaff = new Map<string, { total: number; store: string; name: string }>();
  for (const o of ot ?? []) {
    const cur = otByStaff.get(o.staff_id) ?? { total: 0, store: o.store_id, name: (o.staff as unknown as { name?: string } | null)?.name ?? "" };
    cur.total += o.overtime_minutes;
    otByStaff.set(o.staff_id, cur);
  }
  for (const [staffId, v] of otByStaff) {
    if (v.total < 600 || dup.has(`overtime_alert|${staffId}|${v.store}`)) continue;
    dup.add(`overtime_alert|${staffId}|${v.store}`);
    inserts.push({
      company_id: actor.companyId,
      kind: "overtime_alert",
      severity: v.total >= 1200 ? "critical" : "warning",
      store_id: v.store,
      staff_id: staffId,
      title: `残業時間が増えています（${v.name}）`,
      body: `今月の残業が合計${Math.round(v.total / 60)}時間に達しています。シフト調整を検討してください。`,
      suggested_action: { type: "review_shifts", params: { staff_id: staffId } },
      source: "rule",
    });
  }

  if (inserts.length > 0) {
    await admin.from("ai_suggestions").insert(inserts);
    await logAudit(actor, "suggestions.generate", "ai_suggestions", null, null, { count: inserts.length });
  }
  revalidatePath("/hq");
  revalidatePath("/hq/suggestions");
}
