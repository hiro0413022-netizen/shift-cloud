"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor, assertStoreAccess } from "@/lib/auth";
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
    .select("id, name, status, member_no, store_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before || before.status !== "pending") return;
  // #134: 他店舗の入会申込を承認できないようサーバー側で検証（画面に出ていなくても弾く）
  assertStoreAccess(actor, (before as { store_id: string | null }).store_id);

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
    .select("id, name, status, store_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before || before.status !== "pending") return;
  // #134: 他店舗の体験申込を確定/キャンセルできないようサーバー側で検証
  assertStoreAccess(actor, (before as { store_id: string | null }).store_id);

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

/**
 * ホットリード（配った資料が開かれた）の対応済み化（#95）。
 * trk_links.notified_at を立てるとフィードから消える。判断そのものは架電＝画面外なので、
 * ここは「対応した」という人間の宣言を記録するだけ。
 */
export async function dismissHotLead(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("trk_links")
    .select("id, label, app, notified_at")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .maybeSingle();
  if (!before || before.notified_at) return;

  await admin
    .from("trk_links")
    .update({ notified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await logAudit(actor, "track.hotlead_handled", "trk_links", id, before, { notified_at: "now" });
  await logEvent(actor.companyId, {
    event_type: "track.handled",
    title: `開封フォローを対応済みに: ${String(before.label ?? "（無題）")}`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/");
}

/**
 * 整合性・法務・KPIアラート（リンク型）の「確認する」（#101）。
 * これまでこのボタンは詳細ページへ飛ぶだけで一覧から消えなかったバグの修正。
 * gn_alert_acks に記録するだけ＝元データは変えない。値が変わればキーが変わり自動的に再表示される。
 */
export async function acknowledgeAlert(formData: FormData) {
  const actor = await requireGenesisActor();
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return;

  const admin = createAdmin();
  await admin
    .from("gn_alert_acks")
    .upsert(
      { company_id: actor.companyId, alert_key: key, acked_by: actor.staffId, acked_at: new Date().toISOString() },
      { onConflict: "company_id,alert_key" }
    );
  revalidatePath("/");
}
