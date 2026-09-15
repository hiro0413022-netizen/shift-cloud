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
