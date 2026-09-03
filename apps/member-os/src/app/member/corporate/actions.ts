"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/member";
import { logEvent } from "@/lib/kernel";
import { sendFrankMail, buildCorporateUserMail } from "@/lib/frank-mail";
import { nextMemberNo } from "@/lib/frank-member-no";
import { createCorporateUserMembers } from "@yozan/core/frank-corporate-members";
import {
  corporateSpec, corporateSeats, corporateSeatFullMessage, normalizeCorporateUsers,
} from "@yozan/core/frank-corporate";
import { isOpenBooking } from "@yozan/core/frank-corporate";
import { readName } from "@/lib/name";

/**
 * 法人プランのご利用者を、お客様ご自身（ご契約者）が管理する（#206・2026-09-03）
 *
 * #195 では入会フォームで全員のお名前を伺い、入れ替えは店頭に電話していただく形だった。
 * 「まだ誰が使うか決まっていない」会社は申し込めず、人事異動のたびに店舗が手を動かしていた。
 * ここを会社側で完結させる。
 *
 * ★ 触れるのはご契約者だけ
 *   ご利用者の行でログインしても、この画面の操作は受け付けない。
 *   （他の社員の登録を外せてしまうため）
 *
 * ★ 増やしても請求は増えない
 *   月会費のサブスクを持つのはご契約者の行だけ。ここで作る行に決済情報は入れない。
 *   これは @yozan/core/frank-corporate-members が守っている。
 *
 * ★ 外すときは、先のご予約を確かめる
 *   予約を残したまま外すと、御社の枠だけ埋まったまま誰も消せない状態になる。
 */

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
/** この画面に戻す。redirect は never を返すので、呼んだ先はここで止まる（型にも書く） */
function back(q: string): never {
  redirect(`/member/corporate?${q}`);
}
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const jstNowHm = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 16);

const CONTRACT_COLS =
  "id, company_id, store_id, plan_id, company_name, corporate_self_use, corporate_parent_id, " +
  "frunk_plans(name, is_corporate, max_users, max_open_slots, max_bookings_per_day, companion_free)";

/** ご契約者の行を取る。ご利用者・個人会員はここで弾く（この画面の唯一の入口） */
async function requireContract() {
  const member = await requireMember();
  const admin = createAdmin();
  const { data: row } = await admin
    .from("frunk_members").select(CONTRACT_COLS)
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();
  // 列名を文字列で組み立てているため型が付かない。使う形にここで1度だけ寄せる
  const me = (row ?? null) as Record<string, unknown> | null;
  if (!me) redirect("/member");
  const spec = corporateSpec(me.frunk_plans as never);
  if (!spec.isCorporate) redirect("/member");
  // ご利用者の行では管理させない（外せるのはご契約者だけ）
  if (me.corporate_parent_id) redirect("/member?err=" + encodeURIComponent("ご利用者の管理は、ご契約者様の会員番号でログインしてお使いください"));
  return { member, admin, root: me, spec };
}

/** いま何名ご登録いただいているか（ご担当者ご自身を含む） */
async function seatsOf(admin: ReturnType<typeof createAdmin>, root: Record<string, unknown>, maxUsers: number | null) {
  const { count } = await admin
    .from("frunk_members").select("id", { count: "exact", head: true })
    .eq("corporate_parent_id", String(root.id)).is("deleted_at", null);
  return corporateSeats({ maxUsers, registered: count ?? 0, selfUse: !!root.corporate_self_use });
}

/** ご利用者を追加する（会員番号を発行し、メールがあればご案内をお送りする） */
export async function addUser(formData: FormData) {
  const { member, admin, root, spec } = await requireContract();

  const { name, nameKana } = readName(formData);
  const phone = str(formData.get("cu_phone"));
  const email = orNull(formData.get("cu_email"));
  const norm = normalizeCorporateUsers(
    [{ name, nameKana, phone, email, birthDate: str(formData.get("cu_birth_date")) }],
    spec.maxUsers,
    1,
  );
  if (norm.error) back("err=" + encodeURIComponent(norm.error));

  const seats = await seatsOf(admin, root, spec.maxUsers);
  if (!seats.canAdd) back("err=" + encodeURIComponent(corporateSeatFullMessage(seats.limit ?? 0)));

  // 同じ電話番号は会員ページのログインが取り違えるので受けない
  const { data: dup } = await admin
    .from("frunk_members").select("id, name")
    .eq("corporate_parent_id", String(root.id)).eq("phone", phone)
    .is("deleted_at", null).maybeSingle();
  if (dup) back("err=" + encodeURIComponent(`同じ電話番号のご利用者（${String(dup.name)} 様）が既にご登録済みです`));

  const created = await createCorporateUserMembers(admin, {
    id: String(root.id),
    company_id: String(root.company_id),
    store_id: root.store_id ? String(root.store_id) : null,
    plan_id: root.plan_id ? String(root.plan_id) : null,
    company_name: root.company_name ? String(root.company_name) : null,
    corporate_users: norm.users,
    today: jstToday(),
    assignMemberNo: (id) => nextMemberNo(admin, member.companyId, id),
  });
  if (created.length === 0) back("err=" + encodeURIComponent("ご利用者を追加できませんでした。時間をおいてもう一度お試しください"));

  const u = created[0];
  await logEvent(member.companyId, {
    event_type: "frunk.corporate_user_add",
    title: `法人ご利用者を追加（会員ページ）: ${root.company_name ?? ""} ${u.name} 様 = ${u.memberNo}`,
    source: "web", source_type: "external", severity: "info",
  });

  // ご本人にメールアドレスをいただけていれば、ログイン方法つきでご案内する（#206 ユーザー確定）。
  // 送れなくても登録は成立させる（会員番号は画面にも出す）
  let mailed = false;
  if (email) {
    const mail = buildCorporateUserMail({
      name: u.name,
      memberNo: u.memberNo,
      companyName: root.company_name ? String(root.company_name) : null,
      maxOpenSlots: spec.maxOpenSlots,
    });
    const r = await sendFrankMail({ to: email, subject: mail.subject, text: mail.text });
    mailed = !!r.ok;
  }

  revalidatePath("/member/corporate");
  back("msg=" + encodeURIComponent(
    `${u.name} 様をご利用者に追加しました。会員番号は ${u.memberNo} です（ログインは会員番号と電話番号の下4桁）。` +
    (email ? (mailed ? "ご本人あてにご案内メールをお送りしました。" : "※ご案内メールは送信できませんでした。会員番号を直接お伝えください。") : ""),
  ));
}

/** ご利用者の登録を外す（人が入れ替わったとき）。行は消さずに退会にして履歴を残す */
export async function removeUser(formData: FormData) {
  const { member, admin, root } = await requireContract();
  const userId = str(formData.get("user_id"));
  if (!userId) back("err=" + encodeURIComponent("対象が選ばれていません"));

  const { data: u } = await admin
    .from("frunk_members").select("id, name, member_no")
    .eq("id", userId).eq("corporate_parent_id", String(root.id))
    .is("deleted_at", null).maybeSingle();
  if (!u) back("err=" + encodeURIComponent("御社のご利用者ではありません"));

  // 先のご予約が残っていたら外させない。
  // 外すと本人はログインできなくなり、その予約を誰もキャンセルできないまま
  // 御社の枠だけが埋まり続ける（枠は消化されるまで戻らない）
  const today = jstToday();
  const { data: bookings } = await admin
    .from("frunk_bookings").select("booked_date, start_time, end_time, status")
    .eq("member_id", userId).gte("booked_date", today)
    .neq("status", "cancelled").is("deleted_at", null);
  const open = (bookings ?? []).filter((b) =>
    isOpenBooking(
      { date: String(b.booked_date), endTime: String(b.end_time), minutes: 60, status: String(b.status ?? "") },
      today, jstNowHm(),
    ),
  );
  if (open.length > 0) {
    back("err=" + encodeURIComponent(
      `${String(u.name)} 様にはこれからのご予約が${open.length}件残っています。先にご予約をキャンセルしてから、登録を外してください（御社の枠も同時に戻ります）。`,
    ));
  }

  await admin
    .from("frunk_members")
    .update({ status: "left", leave_date: today, corporate_parent_id: null, updated_at: new Date().toISOString() })
    .eq("id", userId).eq("corporate_parent_id", String(root.id));
  await logEvent(member.companyId, {
    event_type: "frunk.corporate_user_remove",
    title: `法人ご利用者の登録を外した（会員ページ）: ${root.company_name ?? ""} ${String(u.name)} 様（${String(u.member_no ?? "")}）`,
    source: "web", source_type: "external", severity: "info",
  });
  revalidatePath("/member/corporate");
  back("msg=" + encodeURIComponent(`${String(u.name)} 様のご登録を外しました。空いた枠に新しい方をご登録いただけます。`));
}

/**
 * ご担当者ご自身も使う／使わない（#206 ユーザー確定）
 *
 * ご契約者の行は月会費のお支払いを持つだけで、そのままでは予約できない。
 * 「使う人は必ずご登録いただく」を、ご担当者にも同じように当てはめる。
 * 入れると人数にも1名として数える（法人ライトは2名までなので、残り1名になる）。
 */
export async function toggleSelfUse(formData: FormData) {
  const { member, admin, root, spec } = await requireContract();
  const on = str(formData.get("on")) === "1";

  if (on) {
    const seats = await seatsOf(admin, root, spec.maxUsers);
    if (!seats.canAdd) back("err=" + encodeURIComponent(corporateSeatFullMessage(seats.limit ?? 0)));
  } else {
    // 外すとご自身は予約できなくなる。先の予約が残っていないか確かめる
    const today = jstToday();
    const { data: bookings } = await admin
      .from("frunk_bookings").select("booked_date, start_time, end_time, status")
      .eq("member_id", String(root.id)).gte("booked_date", today)
      .neq("status", "cancelled").is("deleted_at", null);
    const open = (bookings ?? []).filter((b) =>
      isOpenBooking(
        { date: String(b.booked_date), endTime: String(b.end_time), minutes: 60, status: String(b.status ?? "") },
        today, jstNowHm(),
      ),
    );
    if (open.length > 0) {
      back("err=" + encodeURIComponent(`これからのご予約が${open.length}件残っています。先にご予約をキャンセルしてください。`));
    }
  }

  await admin
    .from("frunk_members")
    .update({ corporate_self_use: on, updated_at: new Date().toISOString() })
    .eq("id", String(root.id));
  await logEvent(member.companyId, {
    event_type: "frunk.corporate_self_use",
    title: `法人ご契約者ご自身の利用登録を${on ? "追加" : "解除"}: ${root.company_name ?? ""} ${member.name} 様`,
    source: "web", source_type: "external", severity: "info",
  });
  revalidatePath("/member/corporate");
  revalidatePath("/member");
  back("msg=" + encodeURIComponent(
    on
      ? "ご担当者様ご自身をご利用者に登録しました。この会員番号でも打席をご予約いただけます。"
      : "ご担当者様ご自身のご利用登録を外しました。この会員番号では打席のご予約をお取りいただけません。",
  ));
}
