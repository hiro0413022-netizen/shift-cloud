import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import {
  loadBookingCfg,
  businessHours,
  genSlots,
  toMin,
  toTime,
  FRANK_STORE_ID,
  type BookingCfg,
} from "@yozan/core/frank-booking";

/**
 * スタッフ画面（member-os）から FRANK の予約台帳を読む（#93 台帳一本化）
 *
 * ★ 台帳は frunk_bays / frunk_bookings のみ。旧 res_resources / res_bookings は廃止（0084）。
 * ★ 営業時間・枠の刻みはお客様側（サイト）と同じ設定を使う（@yozan/core/frank-booking）。
 *   スタッフ画面だけ別の時間割にすると「サイトでは取れるのに画面に出ない」が起きるため。
 */

export type BayRow = {
  id: string;
  code: string;
  name: string;
  floor: number;
  equipment: string | null;
  is_lefty: boolean;
  active: boolean;
};

export type BookingRow = {
  id: string;
  bay_id: string;
  booked_date: string;
  start_time: string;
  end_time: string;
  status: string;
  customer_kind: string;
  guest_name: string | null;
  guest_phone: string | null;
  party_size: number | null;
  note: string | null;
  amount: number | null;
  paid_amount: number;
  payment_status: string;
  payment_method: string | null;
  member_id: string | null;
  trial_request_id: string | null;
  frunk_members: { name: string; member_no: string } | null;
  frunk_bays: { name: string } | null;
  mbr_trial_requests: { name: string; phone: string | null; lefty: boolean; experience: string | null; message: string | null } | null;
};

export type LessonRow = {
  id: string;
  bay_id: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
  staff: { name: string } | null;
};

const BOOKING_COLS =
  "id, bay_id, booked_date, start_time, end_time, status, customer_kind, guest_name, guest_phone, party_size, note, " +
  "amount, paid_amount, payment_status, payment_method, member_id, trial_request_id, " +
  "frunk_members(name, member_no), frunk_bays(name), " +
  "mbr_trial_requests(name, phone, lefty, experience, message)";

export type DayView = {
  date: string;
  cfg: BookingCfg;
  closed: boolean;
  hours: { open: string; close: string } | null;
  slots: string[];
  bays: BayRow[];
  bookings: BookingRow[];
  lessons: LessonRow[];
};

/** 1日ぶんの予約状況（打席・予約・レッスン枠をまとめて取る） */
export async function loadDay(dateStr: string): Promise<DayView> {
  const admin = createAdmin();
  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(dateStr, cfg);

  const [{ data: bays }, { data: bookings }, { data: lessons }] = await Promise.all([
    admin
      .from("frunk_bays")
      .select("id, code, name, floor, equipment, is_lefty, active")
      .is("deleted_at", null)
      .order("sort"),
    admin
      .from("frunk_bookings")
      .select(BOOKING_COLS)
      .eq("booked_date", dateStr)
      .is("deleted_at", null)
      .order("start_time"),
    admin
      .from("frunk_lesson_slots")
      .select("id, bay_id, slot_date, start_time, end_time, status, staff(name)")
      .eq("slot_date", dateStr)
      .eq("status", "open")
      .is("deleted_at", null)
      .order("start_time"),
  ]);

  return {
    date: dateStr,
    cfg,
    closed: !hours,
    hours,
    slots: hours ? genSlots(hours, cfg.slot_minutes) : [],
    bays: ((bays ?? []) as unknown as BayRow[]),
    bookings: ((bookings ?? []) as unknown as BookingRow[]),
    lessons: ((lessons ?? []) as unknown as LessonRow[]),
  };
}

/** 未収金（全期間・キャンセル分は除く） */
export async function loadUnpaid(): Promise<BookingRow[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_bookings")
    .select(BOOKING_COLS)
    .in("payment_status", ["unpaid", "partial"])
    .neq("status", "cancelled")
    .not("amount", "is", null)
    .is("deleted_at", null)
    .order("booked_date")
    .limit(300);
  return ((data ?? []) as unknown as BookingRow[]);
}

/** 予約が占有している時間帯を、打席ごとの「開始時刻の集合」に展開する（グリッド表示用） */
export function occupancy(view: DayView): Map<string, BookingRow> {
  const step = view.cfg.slot_minutes;
  const map = new Map<string, BookingRow>();
  for (const b of view.bookings) {
    if (b.status === "cancelled") continue;
    for (let m = toMin(b.start_time); m < toMin(b.end_time); m += step) {
      map.set(`${b.bay_id}|${toTime(m)}`, b);
    }
  }
  return map;
}

/** レッスン枠が打席を押さえている時間帯（打席指定の枠のみ） */
export function lessonOccupancy(view: DayView): Map<string, LessonRow> {
  const step = view.cfg.slot_minutes;
  const map = new Map<string, LessonRow>();
  for (const l of view.lessons) {
    if (!l.bay_id) continue;
    for (let m = toMin(l.start_time); m < toMin(l.end_time); m += step) {
      map.set(`${l.bay_id}|${toTime(m)}`, l);
    }
  }
  return map;
}

export { FRANK_STORE_ID, toMin, toTime };
