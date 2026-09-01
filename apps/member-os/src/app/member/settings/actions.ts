"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { reissueCheckinToken } from "@/lib/frank-portal";
import { tokenFingerprint } from "@yozan/core/frank-portal";
import { logEvent } from "@/lib/kernel";
import { handoffSecret, signHandoff } from "@yozan/core/frank-handoff";

const GENESIS_URL = process.env.GENESIS_URL || "https://yozan-genesis.vercel.app";

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

/**
 * 月会費のお支払い登録（クレジットカード・#188）
 *
 * これまで入口は公式サイトの打席予約ページの下にあり、お客様は会員番号と電話下4桁を
 * もう一度入力していた。ポータルにログイン済みなら聞き直す理由がないので、
 * ここから引き渡しトークン（#152）でSquareの決済ページを開く。
 *
 * 決済リンクの発行は genesis 側（Square env は yozan-genesis にしか無い）。
 * 失敗したら理由を画面に出す＝「押しても何も起きない」を作らない。
 */
export async function startBillingCheckout() {
  const member = await requireMember();
  const back = "/member/settings";
  if (member.isProvisional) redirect(`${back}?err=${encodeURIComponent("ご入会の手続きが完了してからご登録いただけます")}`);

  const secret = handoffSecret();
  if (!secret) redirect(`${back}?err=${encodeURIComponent("ただいまお手続きページを開けません。恐れ入りますが受付までお問い合わせください")}`);

  let url = "";
  let error = "";
  try {
    const res = await fetch(`${GENESIS_URL}/api/public/frank/billing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: signHandoff(member.memberNo, secret) }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (j.ok && j.url) url = j.url;
    else error = j.error || "お手続きページを開けませんでした";
  } catch (e) {
    console.error("[member/settings] billing checkout failed:", e);
    error = "通信に失敗しました。時間をおいてお試しください";
  }
  if (!url) redirect(`${back}?err=${encodeURIComponent(error)}`);
  redirect(url);
}
