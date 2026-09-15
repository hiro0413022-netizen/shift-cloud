"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor, storeScope, assertStoreAccess } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { storeInValues, logAudit, logEvent } from "@/lib/kernel";
import { jstYmd } from "@/lib/jst";
import type { ChangeCounts } from "@/lib/home-pure";

/**
 * ② 前回見た時からの変化（#244）。
 * 前回の時刻はブラウザ（localStorage）が持つ。サーバーは「その時刻以降の件数」を数えるだけ。
 * 出どころ: 入会＝frunk_members の承認日時／体験申込＝mbr_trial_requests／退会の申出＝frunk_members の退会日が入った更新／
 *          問い合わせ＝sec_inquiries／警告＝company_events（warning 以上）
 */
export async function changesSince(sinceIso: string): Promise<ChangeCounts> {
  const actor = await requireGenesisActor();
  const since = new Date(sinceIso);
  if (Number.isNaN(since.getTime())) return { joins: 0, trials: 0, leaves: 0, inquiries: 0, warnings: 0 };
  const iso = since.toISOString();
  const admin = createAdmin();
  const scope = storeScope(actor);
  const allowed = Array.isArray(scope) ? new Set(scope) : null;
  const byStore = <T,>(q: T): T =>
    allowed ? (q as unknown as { in: (c: string, v: string[]) => T }).in("store_id", storeInValues(allowed)) : q;
  const head = { count: "exact" as const, head: true };
  const n = (r: { count: number | null; error: unknown }) => (r.error ? 0 : (r.count ?? 0));

  const [joins, trials, leaves, inquiries, warnings] = await Promise.all([
    byStore(admin.from("frunk_members").select("id", head).eq("company_id", actor.companyId).eq("status", "active").gte("reviewed_at", iso).is("deleted_at", null)),
    byStore(admin.from("mbr_trial_requests").select("id", head).eq("company_id", actor.companyId).gte("created_at", iso).is("deleted_at", null)),
    byStore(admin.from("frunk_members").select("id", head).eq("company_id", actor.companyId).not("leave_date", "is", null).gte("updated_at", iso).is("deleted_at", null)),
    admin.from("sec_inquiries").select("id", head).eq("company_id", actor.companyId).gte("received_at", iso).is("deleted_at", null),
    admin.from("company_events").select("id", head).eq("company_id", actor.companyId).in("severity", ["warning", "critical"]).gte("occurred_at", iso).is("deleted_at", null),
  ]);
  return { joins: n(joins), trials: n(trials), leaves: n(leaves), inquiries: n(inquiries), warnings: n(warnings) };
}

/**
 * ③ まとめて承認（Web入会）。ホームの右パネルから、同じ種類の承認待ちを一度に通す。
 * 1件ずつの承認（feed-actions.decideJoinRequest）と同じ規則で、会員番号を連番で振る。
 * 店舗スコープ（#134）はサーバーで1件ずつ検証する。
 */
export async function approveJoinRequestsBulk(formData: FormData) {
  const actor = await requireGenesisActor();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;
  const admin = createAdmin();
  const { data: rows } = await admin
    .from("frunk_members")
    .select("id, name, status, store_id")
    .eq("company_id", actor.companyId)
    .eq("status", "pending")
    .in("id", ids)
    .order("created_at", { ascending: true });
  let approved = 0;
  for (const before of (rows ?? []) as { id: string; name: string; status: string; store_id: string | null }[]) {
    assertStoreAccess(actor, before.store_id);
    const { count } = await admin
      .from("frunk_members")
      .select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId)
      .not("member_no", "is", null);
    const memberNo = `FR${String((count ?? 0) + 1).padStart(4, "0")}`;
    const { error } = await admin
      .from("frunk_members")
      .update({ status: "active", member_no: memberNo, join_date: jstYmd(), reviewed_by: actor.staffId, reviewed_at: new Date().toISOString() })
      .eq("id", before.id)
      .eq("company_id", actor.companyId)
      .eq("status", "pending");
    if (error) continue;
    await logAudit(actor, "frunk.signup_approve", "frunk_members", before.id, before, { status: "active", member_no: memberNo, bulk: true });
    await logEvent(actor.companyId, {
      event_type: "join.approved",
      title: `Web入会を承認: ${before.name}（${memberNo}）`,
      source: "manual",
      source_type: "human",
    });
    approved += 1;
  }
  if (approved > 0) revalidatePath("/");
}

/**
 * #246 「デモ完成」を消す（ユーザー指摘「消すことができない」）。
 * dms_prospects を hold にする＝営業先は残る（消さない）が、今日やることからは外れる。
 * 連絡した扱い（last_contact_on）にはしない＝嘘を書かない。
 */
export async function dismissProspect(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdmin();
  const { data: before } = await admin.from("dms_prospects").select("id, name, status").eq("id", id).eq("company_id", actor.companyId).maybeSingle();
  if (!before) return;
  await admin.from("dms_prospects").update({ status: "hold", updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "prospect.hold", "dms_prospects", id, before, { status: "hold" });
  revalidatePath("/");
}

/**
 * #246 「一旦今日のやることは消しておいて」。
 * AIが作ったもの（承認待ちのAI実行・成果物レビュー・デモ完成）をまとめて取り下げる。
 * お客様から来たもの（問い合わせ・体験・入会・予約申込）は**消さない**（人が返事をする件）。
 * 取り下げは記録に残る（cancelled / rejected / hold）ので、必要なら各画面から辿れる。
 */
export async function clearAiBacklog() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const now = new Date().toISOString();
  const note = `${jstYmd()} ホームの「AIが作ったものを全部消す」で取り下げ（${actor.name}）`;
  const [q, d, p] = await Promise.all([
    admin.from("ai_action_queue").update({ status: "cancelled", cancelled_at: now, error: note }).eq("company_id", actor.companyId).eq("status", "awaiting_approval").select("id"),
    admin.from("ai_execution_logs").update({ review_status: "rejected", reviewed_at: now, reviewed_by: actor.staffId }).eq("company_id", actor.companyId).eq("review_status", "pending").select("id"),
    admin.from("dms_prospects").update({ status: "hold", updated_at: now }).eq("company_id", actor.companyId).eq("status", "demo_done").is("last_contact_on", null).is("deleted_at", null).select("id"),
  ]);
  const counts = { queue: q.data?.length ?? 0, deliverables: d.data?.length ?? 0, prospects: p.data?.length ?? 0 };
  await logAudit(actor, "home.clear_ai_backlog", "ai_action_queue", null, null, counts);
  await logEvent(actor.companyId, {
    event_type: "home.cleared",
    title: `AIが作ったものをまとめて取り下げ（AI実行 ${counts.queue}・成果物 ${counts.deliverables}・デモ ${counts.prospects}）`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/");
}
