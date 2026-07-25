import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { FrankClient, type SlotView, type CoachOpt, type BayOpt } from "./frank-client";

export const dynamic = "force-dynamic";

/**
 * FRANK レッスンカレンダー（#88 §3-4）
 * プロ別・打席別の枠管理＋予約状況＋申し送り（前回→次回に自動表示）＋カルテ連携。
 */

const FRANK_STORE = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default async function FrankLessonPage() {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const from = jstToday();
  const to = new Date(Date.now() + 9 * 3600_000 + 30 * 86400_000).toISOString().slice(0, 10);

  // コーチ候補 = FRANK配属スタッフ
  const { data: assigns } = await admin
    .from("staff_store_assignments")
    .select("staff_id, staff(id, name, status)")
    .eq("store_id", FRANK_STORE)
    .is("deleted_at", null);
  type AssignRow = { staff_id: string; staff: { id: string; name: string; status: string } | null };
  const coaches: CoachOpt[] = ((assigns ?? []) as unknown as AssignRow[])
    .filter((a) => a.staff && a.staff.status === "active")
    .map((a) => ({ id: a.staff!.id, name: a.staff!.name }));

  const { data: bays } = await admin
    .from("frunk_bays")
    .select("id, name")
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort");
  const bayOpts: BayOpt[] = (bays ?? []).map((b) => ({ id: String(b.id), name: String(b.name) }));

  // 枠（今日〜30日先）
  const { data: slots } = await admin
    .from("frunk_lesson_slots")
    .select("id, slot_date, start_time, end_time, status, note, coach_staff_id, staff(name), frunk_bays(name)")
    .gte("slot_date", from)
    .lte("slot_date", to)
    .is("deleted_at", null)
    .order("slot_date")
    .order("start_time");

  const slotIds = (slots ?? []).map((s) => String(s.id));
  const { data: bookings } = slotIds.length
    ? await admin
        .from("frunk_lesson_bookings")
        .select("id, slot_id, member_id, student_id, status, record_note, handover_note, frunk_members(name, member_no)")
        .in("slot_id", slotIds)
        .in("status", ["confirmed", "done"])
        .is("deleted_at", null)
    : { data: [] };
  type BookingRow = {
    id: string; slot_id: string; member_id: string; student_id: string | null; status: string;
    record_note: string | null; handover_note: string | null;
    frunk_members: { name: string; member_no: string } | null;
  };
  const bkRows = (bookings ?? []) as unknown as BookingRow[];
  const bkBySlot = new Map(bkRows.map((b) => [String(b.slot_id), b]));

  // 申し送り: 会員ごとの実施済みレッスン（handoverあり）を時系列で取得
  const memberIds = [...new Set(bkRows.map((b) => String(b.member_id)))];
  const { data: history } = memberIds.length
    ? await admin
        .from("frunk_lesson_bookings")
        .select("member_id, handover_note, frunk_lesson_slots!inner(slot_date, start_time)")
        .in("member_id", memberIds)
        .eq("status", "done")
        .not("handover_note", "is", null)
        .is("deleted_at", null)
    : { data: [] };
  type HistRow = { member_id: string; handover_note: string; frunk_lesson_slots: { slot_date: string; start_time: string } };
  const histRows = (history ?? []) as unknown as HistRow[];

  const prevHandover = (memberId: string, date: string, start: string): string | null => {
    const key = date + String(start);
    let best: { k: string; note: string } | null = null;
    for (const h of histRows) {
      if (String(h.member_id) !== memberId) continue;
      const hk = String(h.frunk_lesson_slots.slot_date) + String(h.frunk_lesson_slots.start_time).slice(0, 5);
      if (hk >= key) continue;
      if (!best || hk > best.k) best = { k: hk, note: h.handover_note };
    }
    return best?.note ?? null;
  };

  type SlotRow = {
    id: string; slot_date: string; start_time: string; end_time: string; status: string; note: string | null;
    coach_staff_id: string; staff: { name: string } | null; frunk_bays: { name: string } | null;
  };
  const views: SlotView[] = ((slots ?? []) as unknown as SlotRow[]).map((s) => {
    const bk = bkBySlot.get(String(s.id));
    return {
      id: String(s.id),
      date: String(s.slot_date),
      start: String(s.start_time).slice(0, 5),
      end: String(s.end_time).slice(0, 5),
      status: String(s.status),
      note: s.note,
      coachId: String(s.coach_staff_id),
      coachName: s.staff?.name ?? "コーチ",
      bayName: s.frunk_bays?.name ?? null,
      booking: bk
        ? {
            id: String(bk.id),
            status: String(bk.status),
            memberName: bk.frunk_members?.name ?? "会員",
            memberNo: bk.frunk_members?.member_no ?? "",
            studentId: bk.student_id ? String(bk.student_id) : null,
            record: bk.record_note,
            handover: bk.handover_note,
            prevHandover: prevHandover(String(bk.member_id), String(s.slot_date), String(s.start_time).slice(0, 5)),
          }
        : null,
    };
  });

  return <FrankClient slots={views} coaches={coaches} bays={bayOpts} actorName={actor.name} />;
}
