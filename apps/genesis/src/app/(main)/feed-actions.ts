"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";
import { jstYmd } from "@/lib/jst";

/**
 * 判断フィード用アクション（REDESIGN_2026-07 §3-1）
 * 体験申込の日程確定/キャンセルを member-os と同じ status 遷移でホームから実行する（§5a/§5d）。
 * 確定後のお客様への折り返し連絡はスタッフ運用（#72: 申込型・人が対応）。
 */
/**
 * FRANK Web入会の承認/却下をホームから実行（#78・member-os approveSignup と同一ロジック）。
 * 承認 = 会員番号発行（FR#### 連番）＋ status active ＋ join_date 今日(JST)。
 */
export async function decideJoinRequest(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // approved / rejected
  if (!id || !["approved", "rejected"].includes(decision)) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("frunk_members")
    .select("id, name, status, member_no")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before || before.status !== "pending") return;

  if (decision === "approved") {
    const { count } = await admin
      .from("frunk_members")
      .select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId)
      .not("member_no", "is", null);
    const memberNo = `FR${String((count ?? 0) + 1).padStart(4, "0")}`;
    await admin
      .from("frunk_members")
      .update({
        status: "active",
        member_no: memberNo,
        join_date: jstYmd(),
        reviewed_by: actor.staffId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", actor.companyId);
    await logAudit(actor, "frunk.signup_approve", "frunk_members", id, before, { status: "active", member_no: memberNo });
    await logEvent(actor.companyId, {
      event_type: "join.approved",
      title: `Web入会を承認: ${String(before.name)}（${memberNo}）`,
      source: "manual",
      source_type: "human",
    });
  } else {
    await admin
      .from("frunk_members")
      .update({ status: "rejected", reviewed_by: actor.staffId, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", actor.companyId);
    await logAudit(actor, "frunk.signup_reject", "frunk_members", id, before, { status: "rejected" });
  }
  revalidatePath("/");
}

export async function decideTrialRequest(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // confirmed / canceled
  if (!id || !["confirmed", "canceled"].includes(decision)) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("mbr_trial_requests")
    .select("id, name, status")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before || before.status !== "pending") return;

  await admin
    .from("mbr_trial_requests")
    .update({ status: decision, reviewed_by: actor.staffId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, `trial.${decision}`, "mbr_trial_requests", id, before, { status: decision });
  await logEvent(actor.companyId, {
    event_type: `trial.${decision}`,
    title: `体験申込を${decision === "confirmed" ? "日程確定" : "キャンセル"}: ${String(before.name)}`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/");
}
