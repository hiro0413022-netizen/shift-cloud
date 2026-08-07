"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import {
  createMemberSession, clearMemberSession, requireMember,
} from "@/lib/member";

export type MemberFormState = { error?: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 会員ログイン（会員番号 + 電話番号下4桁）。台帳は frunk_members 一本。
 *
 * 以前は mbr_members / mbr_provisional_members を「会員番号+生年月日」で照合していたが、
 * 打席予約（frankgolf.jp/booking.html）は frunk_members を「会員番号+電話下4桁」で見ており、
 * 会員システムが2つに割れていた。サイトの「Web会員登録」から仮会員(P########)を作った人が
 * 予約ページで必ず弾かれる、という事故になっていたため、FRANK は入会申込に一本化した。
 * （2026-08-07 ユーザー検証で判明）
 */
export async function memberLogin(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const memberNo = str(formData.get("member_no"));
  const last4 = str(formData.get("phone_last4"));
  if (!memberNo || !last4) return { error: "会員番号と電話番号の下4桁を入力してください" };
  if (!/^\d{4}$/.test(last4)) return { error: "電話番号は下4桁（数字）を入力してください" };

  const admin = createAdmin();

  const { data: member } = await admin
    .from("frunk_members")
    .select("company_id, member_no, phone, status")
    .eq("member_no", memberNo)
    .is("deleted_at", null)
    .maybeSingle();

  if (member && String(member.phone ?? "").replace(/\D/g, "").slice(-4) === last4) {
    if (!["active", "approved"].includes(String(member.status))) {
      return { error: "ご入会の承認手続き中です。会員番号のご連絡までお待ちください。" };
    }
    await createMemberSession(member.company_id as string, member.member_no as string, false);
    redirect("/member");
  }

  return { error: "会員番号または電話番号下4桁が一致しません。ご不明な場合は店舗へお問い合わせください。" };
}

/*
 * memberRegister（仮会員の自己登録）は廃止しました（2026-08-07）。
 *
 * mbr_provisional_members に P######## を発行していましたが、打席予約が見るのは
 * frunk_members です。ここで作られた番号では予約ページで必ず弾かれるため、
 * FRANK のご入会は Web入会申込（/join-web → スタッフ承認 → 会員番号発行）に一本化しました。
 * /member/register は /join-web へ転送しています。
 */

export async function memberLogout() {
  await clearMemberSession();
  redirect("/member/login");
}

/*
 * 会員のWeb予約（bookAsMember）は削除しました（#93）。
 * お客様の予約は公式サイト frankgolf.jp/booking.html に一本化し、
 * member-os はスタッフの管理と会員マイページ（確認・キャンセル）に専念します。
 */

/** 会員が自分の予約をキャンセル */
export async function cancelMyBooking(formData: FormData) {
  const member = await requireMember();
  const id = str(formData.get("id"));
  if (!id) return;
  const admin = createAdmin();
  // 台帳は frunk_bookings 一本（#93）。他人の予約を消せないよう member_id で縛る
  const { data: me } = await admin
    .from("frunk_members").select("id")
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();
  if (!me) redirect("/member");
  await admin
    .from("frunk_bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("member_id", me.id)
    .is("deleted_at", null);
  await logEvent(member.companyId, {
    event_type: "reservation.member_canceled",
    title: `会員がWeb予約をキャンセル: ${member.name} 様`,
    source: "web", source_type: "external", severity: "info",
  });
  revalidatePath("/member");
  redirect("/member?canceled=1");
}
