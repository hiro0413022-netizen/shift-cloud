import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { authMember, type MemberAuth } from "@/lib/frank-booking";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";

/**
 * FRANK GOLF レッスン管理 v1（#88 §3-4）
 * - プロが公開した枠（frunk_lesson_slots）を会員が予約（frunk_lesson_bookings）
 * - 会員認証は打席予約と同じ: 会員番号＋電話下4桁（パスワードレス）
 * - 予約時に lsn_students を member_code で find-or-create → カルテ自動生成（Lesson OS連携）
 * - 申し送り（handover_note）は同会員の前回レッスンから次回予約カードに自動表示（Lesson OS側）
 */

type Admin = ReturnType<typeof createAdmin>;

// 店舗UUIDのハードコード重複をやめ @yozan/core の定数に一本化（#134 残タスク④）
const FRANK_STORE = FRANK_STORE_ID;

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 公開中のレッスン枠（今日〜30日先・未予約のみ） */
export async function listOpenLessonSlots() {
  const admin = createAdmin();
  const from = jstToday();
  const to = new Date(Date.now() + 9 * 3600_000 + 30 * 86400_000).toISOString().slice(0, 10);
  const { data: slots } = await admin
    .from("frunk_lesson_slots")
    .select("id, slot_date, start_time, end_time, note, coach_staff_id, staff(name), frunk_bays(name)")
    .eq("store_id", FRANK_STORE) // 店舗スコープ（#134: 公開APIは自店舗の枠だけを出す）
    .eq("status", "open")
    .gte("slot_date", from)
    .lte("slot_date", to)
    .is("deleted_at", null)
    .order("slot_date")
    .order("start_time");
  if (!slots?.length) return { slots: [] };
  const ids = slots.map((s) => s.id);
  const { data: booked } = await admin
    .from("frunk_lesson_bookings")
    .select("slot_id")
    .in("slot_id", ids)
    .in("status", ["confirmed", "done"])
    .is("deleted_at", null);
  const taken = new Set((booked ?? []).map((b) => String(b.slot_id)));
  return {
    slots: slots
      .filter((s) => !taken.has(String(s.id)))
      .map((s) => ({
        id: String(s.id),
        date: String(s.slot_date),
        start: String(s.start_time).slice(0, 5),
        end: String(s.end_time).slice(0, 5),
        coach: (s as unknown as { staff: { name: string } | null }).staff?.name ?? "コーチ",
        bay: (s as unknown as { frunk_bays: { name: string } | null }).frunk_bays?.name ?? null,
        note: s.note ?? null,
      })),
  };
}

/** カルテ（lsn_students）を member_code で find-or-create */
async function ensureStudent(admin: Admin, member: { id: string; company_id: string; name: string; member_no: string }) {
  const { data: existing } = await admin
    .from("lsn_students")
    .select("id")
    .eq("company_id", member.company_id)
    .eq("member_code", member.member_no)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return String(existing.id);
  const { data: created } = await admin
    .from("lsn_students")
    .insert({
      company_id: member.company_id,
      store_id: FRANK_STORE,
      name: member.name,
      member_code: member.member_no,
      memo: "FRANKレッスン予約から自動作成",
      status: "active",
    })
    .select("id")
    .single();
  return created ? String(created.id) : null;
}

/** レッスン予約 */
export async function bookLesson(input: {
  auth: MemberAuth;
  slotId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdmin();
  const member = await authMember(admin, input.auth);
  if (!member) return { ok: false, error: "会員番号または電話番号下4桁が一致しません（入会承認前の場合はご利用いただけません）" };

  const { data: slot } = await admin
    .from("frunk_lesson_slots")
    .select("id, company_id, store_id, slot_date, start_time, end_time, status, staff(name)")
    .eq("id", input.slotId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!slot || slot.status !== "open") return { ok: false, error: "この枠は現在予約できません" };
  // 会社・店舗スコープの検証（#134: id直打ちで他社・他店舗の枠を取れないように）
  if (String(slot.company_id) !== String(member.company_id) || String(slot.store_id) !== FRANK_STORE) {
    return { ok: false, error: "この枠は現在予約できません" };
  }
  if (String(slot.slot_date) < jstToday()) return { ok: false, error: "過去の枠は予約できません" };

  const { data: taken } = await admin
    .from("frunk_lesson_bookings")
    .select("id")
    .eq("slot_id", slot.id)
    .in("status", ["confirmed", "done"])
    .is("deleted_at", null)
    .limit(1);
  if (taken?.length) return { ok: false, error: "この枠はすでに予約が入っています" };

  // 同会員の同日重複（同じ日に2枠は取らせない=v1ルール）
  const { data: sameDay } = await admin
    .from("frunk_lesson_bookings")
    .select("id, frunk_lesson_slots!inner(slot_date)")
    .eq("member_id", member.id)
    .eq("status", "confirmed")
    .eq("frunk_lesson_slots.slot_date", String(slot.slot_date))
    .is("deleted_at", null)
    .limit(1);
  if (sameDay?.length) return { ok: false, error: "同じ日にすでにレッスン予約があります" };

  const studentId = await ensureStudent(admin, {
    id: String(member.id),
    company_id: String(member.company_id),
    name: String(member.name),
    member_no: String(member.member_no),
  });

  const { data: created, error } = await admin
    .from("frunk_lesson_bookings")
    .insert({
      company_id: slot.company_id,
      store_id: slot.store_id,
      slot_id: slot.id,
      member_id: member.id,
      student_id: studentId,
      status: "confirmed",
      source: "web",
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: "予約の保存に失敗しました。別の枠でお試しください" };

  const coach = (slot as unknown as { staff: { name: string } | null }).staff?.name ?? "コーチ";
  await logEvent(String(member.company_id), {
    event_type: "lesson.booked",
    title: `レッスン予約: ${member.name}様 ${slot.slot_date} ${String(slot.start_time).slice(0, 5)}〜（${coach}）`.slice(0, 120),
    source: "frank_lesson",
    source_type: "system",
  });
  return { ok: true, id: String(created.id) };
}

/** 自分のレッスン予約一覧（今日以降） */
export async function listMyLessons(auth: MemberAuth) {
  const admin = createAdmin();
  const member = await authMember(admin, auth);
  if (!member) return null;
  const { data } = await admin
    .from("frunk_lesson_bookings")
    .select("id, status, frunk_lesson_slots!inner(slot_date, start_time, end_time, staff(name), frunk_bays(name))")
    .eq("member_id", member.id)
    .eq("status", "confirmed")
    .gte("frunk_lesson_slots.slot_date", jstToday())
    .is("deleted_at", null);
  type Row = { id: string; status: string; frunk_lesson_slots: { slot_date: string; start_time: string; end_time: string; staff: { name: string } | null; frunk_bays: { name: string } | null } };
  const rows = ((data ?? []) as unknown as Row[])
    .map((r) => ({
      id: r.id,
      date: r.frunk_lesson_slots.slot_date,
      start: String(r.frunk_lesson_slots.start_time).slice(0, 5),
      end: String(r.frunk_lesson_slots.end_time).slice(0, 5),
      coach: r.frunk_lesson_slots.staff?.name ?? "コーチ",
      bay: r.frunk_lesson_slots.frunk_bays?.name ?? null,
    }))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { name: member.name, lessons: rows };
}

/** キャンセル */
export async function cancelLesson(auth: MemberAuth, bookingId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdmin();
  const member = await authMember(admin, auth);
  if (!member) return { ok: false, error: "認証に失敗しました" };
  const { data: bk } = await admin
    .from("frunk_lesson_bookings")
    .select("id, member_id, frunk_lesson_slots(slot_date, start_time)")
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .maybeSingle();
  if (!bk || bk.member_id !== member.id) return { ok: false, error: "予約が見つかりません" };
  await admin.from("frunk_lesson_bookings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", bk.id);
  const s = (bk as unknown as { frunk_lesson_slots: { slot_date: string; start_time: string } | null }).frunk_lesson_slots;
  await logEvent(String(member.company_id), {
    event_type: "lesson.cancelled",
    title: `レッスン予約キャンセル: ${member.name}様 ${s?.slot_date ?? ""} ${String(s?.start_time ?? "").slice(0, 5)}`.slice(0, 120),
    source: "frank_lesson",
    source_type: "system",
  });
  return { ok: true };
}
