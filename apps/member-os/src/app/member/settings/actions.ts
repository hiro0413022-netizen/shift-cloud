"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { reissueCheckinToken } from "@/lib/frank-portal";
import { tokenFingerprint } from "@yozan/core/frank-portal";
import { logEvent } from "@/lib/kernel";

type Row = Record<string, unknown>;

/**
 * 会員証QRの再発行（#154）。
 * 固定式QRを採用したので、スクショが流出したときの逃げ道をお客様側に用意しておく。
 * 押した瞬間に古いQRは使えなくなる（checkin_token を差し替えるだけ）。
 */
export async function reissueMyQr() {
  const member = await requireMember();
  const admin = createAdmin();
  const { data: m } = await admin
    .from("frunk_members").select("id")
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();
  if (!m) redirect("/member");

  const token = await reissueCheckinToken(String((m as Row).id));
  if (token) {
    // 原文は残さない。あとで「いつ誰が再発行したか」を追えれば十分。
    await logEvent(member.companyId, {
      event_type: "frank.checkin_token.reissued",
      title: `会員証QRを再発行: ${member.name} 様（${member.memberNo} / ${tokenFingerprint(token)}）`,
      source: "web", source_type: "external", severity: "notice",
    });
  }
  revalidatePath("/member");
  redirect("/member?reissued=1");
}
