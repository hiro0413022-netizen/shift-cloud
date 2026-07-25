import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";

/**
 * FRANK GOLF 打席予約 v1（#86 §3-3）
 * - 30分単位。営業時間: 平日10-21／土日祝8-20／火曜定休（CMS gn_site_content の store.hours では上書きしない=確定値）
 * - 会員認証: 会員番号＋電話番号下4桁（Web完結・パスワードレス）
 * - プラン上限: レギュラー=1日60分／マスター=1日120分／ライト=1日60分+月8日まで／法人=1日60分(ライト)・120分(プレミアム)
 */

type Admin = ReturnType<typeof createAdmin>;

const FRANK_STORE = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";

/** 予約設定（#87: gn_site_content.data.booking で上書き可能＝/site-adminから変更できる汎用設計） */
export type BookingCfg = {
  weekday: { open: string; close: string };
  weekend: { open: string; close: string };
  closed_dows: number[]; // 定休曜日 0=日〜6=土
  slot_minutes: number;
  max_minutes_options: number[];
  holiday_dates: string[]; // この日付は土日祝営業時間を適用
  closed_dates: string[]; // この日付は臨時休業
  advance_days: number; // 何日先まで予約可
};

export const DEFAULT_BOOKING_CFG: BookingCfg = {
  weekday: { open: "10:00", close: "21:00" },
  weekend: { open: "08:00", close: "20:00" },
  closed_dows: [2], // 火曜定休
  slot_minutes: 30,
  max_minutes_options: [30, 60, 90, 120],
  holiday_dates: [],
  closed_dates: [],
  advance_days: 14,
};

export async function loadBookingCfg(admin: Admin): Promise<BookingCfg> {
  const { data } = await admin.from("gn_site_content").select("data").eq("site", "frank-golf").maybeSingle();
  const o = ((data?.data as Record<string, unknown> | null)?.booking ?? {}) as Partial<BookingCfg>;
  return {
    ...DEFAULT_BOOKING_CFG,
    ...o,
    weekday: { ...DEFAULT_BOOKING_CFG.weekday, ...(o.weekday ?? {}) },
    weekend: { ...DEFAULT_BOOKING_CFG.weekend, ...(o.weekend ?? {}) },
  };
}

/** 営業時間（JSTの日付文字列から曜日判定。祝日・臨時休業は設定で指定） */
export function businessHours(dateStr: string, cfg: BookingCfg = DEFAULT_BOOKING_CFG): { open: string; close: string } | null {
  if (cfg.closed_dates.includes(dateStr)) return null;
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 日付文字列のみ→曜日はUTCでOK
  if (cfg.closed_dows.includes(dow)) return null;
  if (dow === 0 || dow === 6 || cfg.holiday_dates.includes(dateStr)) return cfg.weekend;
  return cfg.weekday;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 打席指定のレッスン枠（open）を打席ブロックとして返す（#88 §3-4） */
async function lessonBaySlots(admin: Admin, dateStr: string): Promise<{ bay_id: string; start_time: string; end_time: string }[]> {
  const { data } = await admin
    .from("frunk_lesson_slots")
    .select("bay_id, start_time, end_time")
    .eq("slot_date", dateStr)
    .eq("status", "open")
    .not("bay_id", "is", null)
    .is("deleted_at", null);
  return (data ?? []).map((s) => ({ bay_id: String(s.bay_id), start_time: String(s.start_time), end_time: String(s.end_time) }));
}

export async function verifyMember(admin: Admin, memberNo: string, phoneLast4: string) {
  const { data } = await admin
    .from("frunk_members")
    .select("id, company_id, name, member_no, phone, status, plan_id, frunk_plans(name, max_bookings_per_day)")
    .eq("member_no", memberNo.trim())
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const digits = String(data.phone ?? "").replace(/\D/g, "");
  if (digits.slice(-4) !== phoneLast4.trim()) return null;
  if (!["active", "approved"].includes(String(data.status))) return null;
  return data;
}

/** 日別の空き状況 */
export async function getSlots(dateStr: string) {
  const admin = createAdmin();
  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(dateStr, cfg);
  const { data: bays } = await admin
    .from("frunk_bays")
    .select("id, code, name, floor, equipment")
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort");
  if (!hours) return { date: dateStr, closed: true, bays: bays ?? [], slots: [], taken: {} };
  const SLOT_MIN = cfg.slot_minutes;

  const slots: string[] = [];
  for (let m = toMin(hours.open); m + SLOT_MIN <= toMin(hours.close); m += SLOT_MIN) slots.push(toTime(m));

  const { data: bookings } = await admin
    .from("frunk_bookings")
    .select("bay_id, start_time, end_time")
    .eq("booked_date", dateStr)
    .eq("status", "confirmed")
    .is("deleted_at", null);

  // レッスン枠（#88 §3-4）: プロが打席指定で公開した枠は打席予約から除外
  const lessonSlots = await lessonBaySlots(admin, dateStr);

  const taken: Record<string, string[]> = {};
  for (const b of [...(bookings ?? []), ...lessonSlots]) {
    const list = taken[String(b.bay_id)] ?? (taken[String(b.bay_id)] = []);
    for (let m = toMin(String(b.start_time)); m < toMin(String(b.end_time)); m += SLOT_MIN) list.push(toTime(m));
  }
  return { date: dateStr, closed: false, hours, bays: bays ?? [], slots, taken };
}

/** プラン上限チェック → OKなら予約作成 */
export async function createBooking(input: {
  memberNo: string;
  phoneLast4: string;
  date: string;
  bayCode: string;
  start: string; // "HH:MM"
  minutes: number; // 30 | 60 | 90 | 120
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdmin();
  const member = await verifyMember(admin, input.memberNo, input.phoneLast4);
  if (!member) return { ok: false, error: "会員番号または電話番号下4桁が一致しません（入会承認前の場合はご利用いただけません）" };

  const cfg = await loadBookingCfg(admin);
  const hours = businessHours(input.date, cfg);
  if (!hours) return { ok: false, error: "この日は休業日です" };
  const startMin = toMin(input.start);
  const endMin = startMin + input.minutes;
  if (startMin < toMin(hours.open) || endMin > toMin(hours.close)) return { ok: false, error: "営業時間外です" };
  if (!cfg.max_minutes_options.includes(input.minutes)) return { ok: false, error: "利用時間が不正です" };
  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  if (input.date < todayJst) return { ok: false, error: "過去の日付は予約できません" };
  const limitDate = new Date(Date.now() + 9 * 3600_000 + cfg.advance_days * 86400_000).toISOString().slice(0, 10);
  if (input.date > limitDate) return { ok: false, error: `予約は${cfg.advance_days}日先までです` };

  // プラン上限
  const plan = (member as unknown as { frunk_plans: { name: string; max_bookings_per_day: number | null } | null }).frunk_plans;
  const dailyMax = (plan?.max_bookings_per_day ?? 1) * 60; // 時間→分
  const { data: sameDay } = await admin
    .from("frunk_bookings")
    .select("start_time, end_time")
    .eq("member_id", member.id)
    .eq("booked_date", input.date)
    .eq("status", "confirmed")
    .is("deleted_at", null);
  const usedMin = (sameDay ?? []).reduce((s, b) => s + (toMin(String(b.end_time)) - toMin(String(b.start_time))), 0);
  if (usedMin + input.minutes > dailyMax) {
    return { ok: false, error: `このプランの1日の上限（${dailyMax / 60}時間）を超えます（本日あと${Math.max(0, dailyMax - usedMin)}分）` };
  }
  if (plan?.name === "ライト会員") {
    const monthStart = `${input.date.slice(0, 7)}-01`;
    const { data: monthRows } = await admin
      .from("frunk_bookings")
      .select("booked_date")
      .eq("member_id", member.id)
      .gte("booked_date", monthStart)
      .lte("booked_date", `${input.date.slice(0, 7)}-31`)
      .eq("status", "confirmed")
      .is("deleted_at", null);
    const days = new Set((monthRows ?? []).map((r) => String(r.booked_date)));
    if (!days.has(input.date) && days.size >= 8) return { ok: false, error: "ライト会員は月8日までのご利用です" };
  }

  const { data: bay } = await admin.from("frunk_bays").select("id, name").eq("code", input.bayCode).eq("active", true).maybeSingle();
  if (!bay) return { ok: false, error: "打席が見つかりません" };

  // 枠の重複（unique indexが最終防衛。ここでは連続枠すべて確認）
  const { data: conflict } = await admin
    .from("frunk_bookings")
    .select("id, start_time, end_time")
    .eq("bay_id", bay.id)
    .eq("booked_date", input.date)
    .eq("status", "confirmed")
    .is("deleted_at", null);
  const lessonBlocks = (await lessonBaySlots(admin, input.date)).filter((s) => s.bay_id === String(bay.id));
  for (const b of [...(conflict ?? []), ...lessonBlocks]) {
    const bs = toMin(String(b.start_time));
    const be = toMin(String(b.end_time));
    if (startMin < be && endMin > bs) return { ok: false, error: "その時間帯はすでに予約が入っています" };
  }

  const { data: created, error } = await admin
    .from("frunk_bookings")
    .insert({
      company_id: member.company_id,
      store_id: FRANK_STORE,
      member_id: member.id,
      bay_id: bay.id,
      booked_date: input.date,
      start_time: input.start,
      end_time: toTime(endMin),
      status: "confirmed",
      source: "web",
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: "予約の保存に失敗しました。別の枠でお試しください" };

  await logEvent(String(member.company_id), {
    event_type: "booking.created",
    title: `打席予約: ${member.name}様 ${input.date} ${input.start}〜${toTime(endMin)}（${bay.name}）`.slice(0, 120),
    source: "frank_booking",
    source_type: "system",
  });
  return { ok: true, id: String(created.id) };
}

export async function listMyBookings(memberNo: string, phoneLast4: string) {
  const admin = createAdmin();
  const member = await verifyMember(admin, memberNo, phoneLast4);
  if (!member) return null;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("frunk_bookings")
    .select("id, booked_date, start_time, end_time, status, frunk_bays(name)")
    .eq("member_id", member.id)
    .gte("booked_date", today)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .order("booked_date")
    .order("start_time");
  return { name: member.name, bookings: data ?? [] };
}

export async function cancelBooking(memberNo: string, phoneLast4: string, bookingId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdmin();
  const member = await verifyMember(admin, memberNo, phoneLast4);
  if (!member) return { ok: false, error: "認証に失敗しました" };
  const { data: bk } = await admin
    .from("frunk_bookings")
    .select("id, member_id, booked_date, start_time")
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .maybeSingle();
  if (!bk || bk.member_id !== member.id) return { ok: false, error: "予約が見つかりません" };
  await admin.from("frunk_bookings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", bk.id);
  await logEvent(String(member.company_id), {
    event_type: "booking.cancelled",
    title: `打席予約キャンセル: ${member.name}様 ${bk.booked_date} ${String(bk.start_time).slice(0, 5)}`.slice(0, 120),
    source: "frank_booking",
    source_type: "system",
  });
  return { ok: true };
}
