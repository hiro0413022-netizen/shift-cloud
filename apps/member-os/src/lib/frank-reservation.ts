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
import { monthRange, EMPTY_DAY_COUNT, type DayCount } from "@/lib/bay-timeline-pure";

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
  frunk_members: { name: string; member_no: string; alert_note: string | null } | null;
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
  "frunk_members(name, member_no, alert_note), frunk_bays(name), " +
  "mbr_trial_requests(name, phone, lefty, experience, message)";

/** 予約1件の詳細（カレンダーの名前クリックで開く・#139）。
 *  一覧より広く引く: 会員のプラン/連絡先、体験申込の連絡先や希望、打席名まで1回で取る。 */
export type BookingDetail = BookingRow & {
  note: string | null;
  source: string | null;
  created_at: string;
  frunk_members:
    | (BookingRow["frunk_members"] & {
        id: string;
        name_kana: string | null;
        phone: string | null;
        email: string | null;
        status: string;
        frunk_plans: { name: string } | null;
      })
    | null;
  mbr_trial_requests:
    | (NonNullable<BookingRow["mbr_trial_requests"]> & {
        id: string;
        name_kana: string | null;
        email: string | null;
        status: string;
        source: string | null;
      })
    | null;
  frunk_bays: { name: string; floor: number | null; equipment: string | null; is_lefty: boolean } | null;
};

const DETAIL_COLS =
  "id, bay_id, booked_date, start_time, end_time, status, customer_kind, guest_name, guest_phone, party_size, note, source, created_at, " +
  "amount, paid_amount, payment_status, payment_method, member_id, trial_request_id, " +
  "frunk_members(id, name, name_kana, member_no, alert_note, phone, email, status, frunk_plans(name)), " +
  "frunk_bays(name, floor, equipment, is_lefty), " +
  "mbr_trial_requests(id, name, name_kana, phone, email, lefty, experience, message, status, source)";

/** 予約1件を引く。会社＋FRANK店舗で必ず絞る（#134）。見つからなければ null */
export async function loadBookingDetail(id: string, companyId: string): Promise<BookingDetail | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_bookings")
    .select(DETAIL_COLS)
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("store_id", FRANK_STORE_ID)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as unknown as BookingDetail | null) ?? null;
}

/** レッスン枠1件（カレンダーの「レッスン」ブロックを押したとき） */
export type LessonDetail = {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
  note: string | null;
  staff: { name: string } | null;
  frunk_bays: { name: string } | null;
};

export async function loadLessonDetail(id: string, companyId: string): Promise<LessonDetail | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_lesson_slots")
    .select("id, slot_date, start_time, end_time, status, note, staff(name), frunk_bays(name)")
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("store_id", FRANK_STORE_ID)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as unknown as LessonDetail | null) ?? null;
}

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

/** 1日ぶんの予約状況（打席・予約・レッスン枠をまとめて取る）
 *  companyId は必須（#134）: 会社・店舗で必ず絞る。呼び出し側で FRANK 店舗のアクセス検証も行うこと。 */
export async function loadDay(dateStr: string, companyId: string): Promise<DayView> {
  const admin = createAdmin();
  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(dateStr, cfg);

  const [{ data: bays }, { data: bookings }, { data: lessons }] = await Promise.all([
    admin
      .from("frunk_bays")
      .select("id, code, name, floor, equipment, is_lefty, active")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("sort"),
    admin
      .from("frunk_bookings")
      .select(BOOKING_COLS)
      .eq("company_id", companyId)
      .eq("store_id", FRANK_STORE_ID)
      .eq("booked_date", dateStr)
      .is("deleted_at", null)
      .order("start_time"),
    admin
      .from("frunk_lesson_slots")
      .select("id, bay_id, slot_date, start_time, end_time, status, staff(name)")
      .eq("company_id", companyId)
      .eq("store_id", FRANK_STORE_ID)
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

/**
 * 月カレンダー用の「その日に何件あるか」（#135）
 *
 * ★ loadDay を35回まわすと 100 クエリを超えるので、件数は1クエリで取る。
 *   月表示に時間軸は作らない（字が小さすぎて読めないため。細かくは日表示で見る）。
 */
export async function loadMonthCounts(
  month: string,
  companyId: string,
): Promise<{ cfg: BookingCfg; counts: Map<string, DayCount> }> {
  const admin = createAdmin();
  const { from, to } = monthRange(month);
  const [cfg, { data: bookings }, { data: lessons }] = await Promise.all([
    loadBookingCfg(admin),
    admin
      .from("frunk_bookings")
      .select("booked_date, customer_kind")
      .eq("company_id", companyId)
      .eq("store_id", FRANK_STORE_ID)
      .gte("booked_date", from)
      .lt("booked_date", to)
      .neq("status", "cancelled")
      .is("deleted_at", null),
    admin
      .from("frunk_lesson_slots")
      .select("slot_date")
      .eq("company_id", companyId)
      .eq("store_id", FRANK_STORE_ID)
      .gte("slot_date", from)
      .lt("slot_date", to)
      .eq("status", "open")
      .is("deleted_at", null),
  ]);

  const counts = new Map<string, DayCount>();
  const at = (d: string): DayCount => {
    const cur = counts.get(d) ?? { ...EMPTY_DAY_COUNT };
    counts.set(d, cur);
    return cur;
  };
  for (const b of (bookings ?? []) as Array<{ booked_date: string; customer_kind: string }>) {
    const c = at(b.booked_date);
    const k = b.customer_kind === "trial" ? "trial" : b.customer_kind === "member" ? "member" : "dropin";
    c[k] += 1;
    c.total += 1;
  }
  for (const l of (lessons ?? []) as Array<{ slot_date: string }>) {
    const c = at(l.slot_date);
    c.lesson += 1;
    c.total += 1;
  }
  return { cfg, counts };
}

/** 未収金（全期間・キャンセル分は除く）。companyId は必須（#134） */
export async function loadUnpaid(companyId: string): Promise<BookingRow[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_bookings")
    .select(BOOKING_COLS)
    .eq("company_id", companyId)
    .eq("store_id", FRANK_STORE_ID)
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
