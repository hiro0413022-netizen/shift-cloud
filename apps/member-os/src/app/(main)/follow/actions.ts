"use server";

import { revalidatePath } from "next/cache";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { requireStoreAccess } from "@/lib/store-scope";
import { sendFrankMail } from "@/lib/frank-mail";

/** 対象の来店行が自分の店舗のものか確かめる（#134）。company_idだけでは他店舗の行を書き換えられる */
async function assertOwnVisit(
  admin: ReturnType<typeof createAdmin>,
  actor: { isOwner: boolean; storeIds: string[]; primaryStoreId: string | null; companyId: string },
  id: string,
): Promise<boolean> {
  const { data } = await admin
    .from("mbr_walkin_visits")
    .select("id, store_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return false;
  requireStoreAccess(actor, data.store_id as string | null);
  return true;
}

export async function markFollowUp(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  if (!(await assertOwnVisit(admin, actor, id))) return;
  const note = String(formData.get("note") ?? "").trim() || null;
  await admin
    .from("mbr_walkin_visits")
    .update({
      follow_up_at: new Date().toISOString(),
      follow_up_note: note,
      follow_up_by: actor.staffId,
      follow_up_channel: "line", // 手動フォロー（公式LINE等）。メール送信は sendFollowMail 側で email を入れる
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/follow");
}

/**
 * AI店長 第1弾（#148）: 下書き文面をメールで送信し、そのままフォロー済にする。
 * - 送信できたときだけ follow_up_at を立てる（送れていないのに済になる事故を防ぐ）
 * - 送信元が FRANK GOLF <info@frankgolf.jp> のため、対象は FRANK 店舗の行のみ（UI側でも出し分け）
 */
export async function sendFollowMail(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!id || !message) return;
  if (!(await assertOwnVisit(admin, actor, id))) return;

  const { data: visit } = await admin
    .from("mbr_walkin_visits")
    .select("id, store_id, follow_up_at, mbr_guests(name, email)")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!visit || visit.follow_up_at) return; // 二重送信防止
  const guest = (visit.mbr_guests ?? null) as { name?: string; email?: string } | null;
  const email = (guest?.email ?? "").trim();
  if (!email) return;

  let storeName = "";
  if (visit.store_id) {
    const { data: store } = await admin
      .from("stores").select("name").eq("id", visit.store_id as string).maybeSingle();
    storeName = String(store?.name ?? "");
  }
  // 送信元ドメインが frankgolf.jp のため、FRANK 店舗以外からは送らない（ブランド混線防止）
  if (!/frank|フランク/i.test(storeName)) return;

  const sent = await sendFrankMail({
    to: email,
    subject: `【${storeName}】ご体験ありがとうございました`,
    text: message,
  });
  if (!sent.ok) {
    console.error("[follow] フォローメール送信失敗（フォロー済にはしない）:", sent.error ?? "skipped");
    return;
  }

  await admin
    .from("mbr_walkin_visits")
    .update({
      follow_up_at: new Date().toISOString(),
      follow_up_note: "AIフォロー文面をメール送信",
      follow_up_by: actor.staffId,
      follow_up_channel: "email",
      follow_up_message: message,
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/follow");
}

export async function undoFollowUp(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  if (!(await assertOwnVisit(admin, actor, id))) return;
  await admin
    .from("mbr_walkin_visits")
    .update({ follow_up_at: null, follow_up_note: null, follow_up_by: null, follow_up_channel: null, follow_up_message: null })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/follow");
}
