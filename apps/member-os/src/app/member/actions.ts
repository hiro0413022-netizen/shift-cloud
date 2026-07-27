"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import {
  createMemberSession, clearMemberSession, requireMember, resolveHimeji,
} from "@/lib/member";

export type MemberFormState = { error?: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 会員ログイン（会員番号 + 生年月日）。実会員(mbr_members)→仮会員(mbr_provisional_members)の順に照合 */
export async function memberLogin(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const memberNo = str(formData.get("member_no"));
  const birth = str(formData.get("birth_date"));
  if (!memberNo || !birth) return { error: "会員番号と生年月日を入力してください" };
  if (!DATE_RE.test(birth)) return { error: "生年月日の形式が正しくありません" };

  const admin = createAdmin();

  const { data: real } = await admin
    .from("mbr_members")
    .select("company_id, member_no, birth_date, name")
    .eq("member_no", memberNo).eq("birth_date", birth).maybeSingle();
  if (real) {
    await createMemberSession(real.company_id as string, real.member_no as string, false);
    redirect("/member");
  }

  const { data: prov } = await admin
    .from("mbr_provisional_members")
    .select("company_id, member_no, birth_date")
    .eq("member_no", memberNo).eq("birth_date", birth).maybeSingle();
  if (prov) {
    await createMemberSession(prov.company_id as string, prov.member_no as string, true);
    redirect("/member");
  }

  return { error: "会員番号または生年月日が一致しません。ご不明な場合は店舗へお問い合わせください。" };
}

/** 新規（仮）会員登録。Smart Hello会員マスタとは別管理の仮会員を作成しログイン状態に */
export async function memberRegister(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  const name = str(formData.get("name"));
  const birth = str(formData.get("birth_date"));
  if (!name) return { error: "お名前を入力してください" };
  if (!birth || !DATE_RE.test(birth)) return { error: "生年月日を入力してください（ログイン時に使用します）" };

  const store = await resolveHimeji();
  if (!store) return { error: "店舗情報が取得できませんでした。時間をおいて再度お試しください。" };
  const admin = createAdmin();

  let memberNo = "";
  for (let i = 0; i < 6; i++) {
    const candidate = "P" + String(Math.floor(10000000 + Math.random() * 89999999));
    const { error } = await admin.from("mbr_provisional_members").insert({
      company_id: store.companyId,
      member_no: candidate,
      name,
      name_kana: orNull(formData.get("name_kana")),
      birth_date: birth,
      phone: orNull(formData.get("phone")),
      email: orNull(formData.get("email")),
    });
    if (!error) { memberNo = candidate; break; }
    if (!String(error.message).includes("duplicate")) {
      return { error: "登録に失敗しました。時間をおいて再度お試しください。" };
    }
  }
  if (!memberNo) return { error: "登録に失敗しました。もう一度お試しください。" };

  await logEvent(store.companyId, {
    event_type: "member.self_register",
    title: `会員マイページから仮登録: ${name}（${memberNo}）`,
    source: "member-os", source_type: "external", severity: "info",
  });
  await createMemberSession(store.companyId, memberNo, true);
  redirect("/member?registered=1");
}

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
