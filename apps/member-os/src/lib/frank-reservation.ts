import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { bookingLine, type LiveItem } from "@/lib/live-feed-pure";

/** 通知の1行を組み立てるときだけ使う緩い行の型（列は select で絞っている） */
type FeedRow = Record<string, unknown>;
import {
  loadBookingCfg,
  businessHours,
  genSlots,
  toMin,
  toTime,
  FRANK_STORE_ID,
  jstToday,
  type BookingCfg,
} from "@yozan/core/frank-booking";
import { monthRange, EMPTY_DAY_COUNT, type DayCount } from "@/lib/bay-timeline-pure";
import { memberDisplayName } from "@yozan/core/frank-corporate";

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
  /** 打席予約に付いた25分パーソナルレッスン（0136）。null=希望なし */
  lesson_option_status: string | null;
  lesson_option_staff_id: string | null;
  lesson_option_start: string | null;
  lesson_option_minutes: number | null;
  lesson_option_fee: number | null;
  lesson_option_note: string | null;
  frunk_members: { name: string; member_no: string; alert_note: string | null; company_name: string | null } | null;
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

const LESSON_OPT_COLS =
  "lesson_option_status, lesson_option_staff_id, lesson_option_start, lesson_option_minutes, lesson_option_fee, lesson_option_note, ";

const BOOKING_COLS =
  "id, bay_id, booked_date, start_time, end_time, status, customer_kind, guest_name, guest_phone, party_size, note, " +
  "amount, paid_amount, payment_status, payment_method, member_id, trial_request_id, " +
  LESSON_OPT_COLS +
  "frunk_members(name, member_no, alert_note, company_name), frunk_bays(name), " +
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
        /** 生年月日（#219）。申込時に伺っている（#190）ので、店頭で聞き直さない */
        birth_date: string | null;
        status: string;
        source: string | null;
      })
    | null;
  frunk_bays: { name: string; floor: number | null; equipment: string | null; is_lefty: boolean } | null;
};

const DETAIL_COLS =
  "id, bay_id, booked_date, start_time, end_time, status, customer_kind, guest_name, guest_phone, party_size, note, source, created_at, " +
  "amount, paid_amount, payment_status, payment_method, member_id, trial_request_id, " +
  LESSON_OPT_COLS +
  "frunk_members(id, name, name_kana, member_no, alert_note, company_name, corporate_parent_id, corporate_self_use, phone, email, status, frunk_plans(name, is_corporate, max_users, max_open_slots, companion_free)), " +
  "frunk_bays(name, floor, equipment, is_lefty), " +
  "mbr_trial_requests(id, name, name_kana, phone, email, birth_date, lefty, experience, message, status, source)";

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
  /** この枠を予約している会員（居なければ null）。カルテへ直接飛ぶために持つ（2026-08-22） */
  booking: { id: string; status: string; member_no: string | null; member_name: string | null } | null;
};

type LessonBookingRow = {
  id: string;
  status: string;
  frunk_members: { name: string | null; member_no: string | null; company_name?: string | null } | null;
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
  if (!data) return null;

  // 予約者（1枠1人・取消は除く）。カレンダーから「誰のレッスンか」を辿れるようにする
  const { data: bk } = await admin
    .from("frunk_lesson_bookings")
    .select("id, status, frunk_members(name, member_no, company_name)")
    .eq("slot_id", id)
    .eq("company_id", companyId)
    .in("status", ["confirmed", "done"])
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const b = (bk as unknown as LessonBookingRow | null) ?? null;

  return {
    ...(data as unknown as Omit<LessonDetail, "booking">),
    booking: b
      ? {
          id: b.id,
          status: b.status,
          member_no: b.frunk_members?.member_no ?? null,
          member_name: b.frunk_members ? memberDisplayName(b.frunk_members as never) : null,
        }
      : null,
  };
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

/**
 * 画面の自動更新に使う「いまの状態」を表す文字列（#197）
 *
 * 予約はお客様が24時間いつでも入れられる。リロードを押すまで出ないと **見落とす**ので、
 * 画面はひとりでに取り直す（LiveRefresh）。その「中身が変わったか」の判定に使う。
 *
 * ★ 今日以降の予約を全部見る（表示している日だけでは、来週の予約が入っても気づけない）。
 * ★ 件数だけでは足りない（1件入って1件キャンセルされたら同じ数になる）ので、
 *   最後に動いた時刻も混ぜる。
 * ★ 体験の申込（mbr_trial_requests）も一緒に見る。体験は予約と同じくらい取りこぼせない。
 */
/**
 * 「何が届いたか」を数件ぶん返す（#202・2026-09-03 ユーザー依頼）
 *
 * 音と一緒に「予約に動きがありました」としか出ていなかったので、
 * **鳴った理由が読んだだけで分かる**ように、直近で動いた予約・体験申込を1行ずつにする。
 * 指紋（signature）の判定は従来どおり別で取る。ここは軽い問い合わせに留める。
 */
export async function loadLiveItems(companyId: string, limit = 5): Promise<LiveItem[]> {
  const admin = createAdmin();
  const [{ data: bookings }, { data: trials }] = await Promise.all([
    admin
      .from("frunk_bookings")
      .select("id, updated_at, booked_date, start_time, status, customer_kind, guest_name, frunk_bays(name), frunk_members(name, company_name), mbr_trial_requests(name)")
      .eq("company_id", companyId)
      .eq("store_id", FRANK_STORE_ID)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit),
    // 日程がまだ決まっていない申込こそ知らせたい（打席予約の行が無いので上では拾えない）
    admin
      .from("mbr_trial_requests")
      .select("id, updated_at, name, booked_date, start_time, status")
      .eq("company_id", companyId)
      .eq("store_id", FRANK_STORE_ID)
      .is("deleted_at", null)
      .is("booked_date", null)
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);

  const items: LiveItem[] = [];
  for (const r of (bookings ?? []) as FeedRow[]) {
    const kind =
      String(r.customer_kind ?? "") === "trial"
        ? "trial"
        : String(r.customer_kind ?? "") === "member"
          ? "member"
          : "dropin";
    // 法人の方は「会社名＋お名前」（#206）。会社名が無ければお名前だけが返る
    const memberName = r.frunk_members ? memberDisplayName(r.frunk_members as never) || null : null;
    const name =
      memberName ??
      (r.mbr_trial_requests as { name?: string } | null)?.name ??
      (r.guest_name as string | null) ??
      null;
    items.push({
      key: `b${String(r.id)}@${String(r.updated_at ?? "")}`,
      kind,
      at: String(r.updated_at ?? ""),
      text: bookingLine({
        kind,
        date: r.booked_date as string | null,
        start: r.start_time as string | null,
        name,
        bay: (r.frunk_bays as { name?: string } | null)?.name ?? null,
        cancelled: String(r.status ?? "") === "cancelled",
      }),
    });
  }
  for (const r of (trials ?? []) as FeedRow[]) {
    items.push({
      key: `t${String(r.id)}@${String(r.updated_at ?? "")}`,
      kind: "trial",
      at: String(r.updated_at ?? ""),
      text: bookingLine({
        kind: "trial",
        date: null,
        start: null,
        name: (r.name as string | null) ?? null,
        cancelled: String(r.status ?? "") === "canceled",
      }),
    });
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function loadLiveSignature(companyId: string): Promise<string> {
  const admin = createAdmin();
  const today = jstToday();
  const [{ data: bookings }, { data: trials }] = await Promise.all([
    admin
      .from("frunk_bookings")
      .select("id, updated_at, status")
      .eq("company_id", companyId)
      .eq("store_id", FRANK_STORE_ID)
      .gte("booked_date", today)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(500),
    // 体験は日付で絞らない（日程がまだ決まっていない申込こそ取りこぼせない）。
    // 直近200件の「最後に動いた時刻」が変われば、新しい申込か状態変更があった合図
    admin
      .from("mbr_trial_requests")
      .select("id, updated_at, status")
      .eq("company_id", companyId)
      .eq("store_id", FRANK_STORE_ID)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);
  const b = (bookings ?? []) as Array<{ updated_at?: string | null; status?: string | null }>;
  const t = (trials ?? []) as Array<{ updated_at?: string | null; status?: string | null }>;
  const live = (rows: Array<{ status?: string | null }>) => rows.filter((r) => String(r.status ?? "") !== "cancelled").length;
  const top = (rows: Array<{ updated_at?: string | null }>) => String(rows[0]?.updated_at ?? "");
  return `b${b.length}:${live(b)}:${top(b)}|t${t.length}:${live(t)}:${top(t)}`;
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

/** レッスンの担当プロ候補（在籍中のスタッフ）。25分パーソナルの確定に使う（0136） */
export async function loadCoaches(companyId: string): Promise<{ id: string; name: string }[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("staff")
    .select("id, name, sort_order")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return ((data ?? []) as Array<{ id: string; name: string }>).map((r) => ({ id: String(r.id), name: String(r.name) }));
}

/**
 * その日の出勤コーチ（#213/#214）
 *
 * 担当プロの選択肢を「その日いる人」だけにする。全スタッフを並べると、
 * 休みの人・他店の人を担当にしてしまい、会員様には確定として届く。
 * 数に入れるのは会員ページの出勤予定に出している人（staff.member_page_role・#209）で、
 * 会員ページのコーチ指名（Genesis側）と同じ名簿。
 *
 * scheduled=false は「その日のシフトがまだ確定していない」。
 * このときは在籍スタッフ全員から選べるようにする（確定できずに詰むのを避ける）。
 */
export async function loadCoachesOnDuty(
  dateStr: string,
): Promise<{ scheduled: boolean; coaches: { id: string; name: string; from: string; to: string }[] }> {
  const admin = createAdmin();
  const { data } = await admin
    .from("shifts")
    .select("staff_id, start_time, end_time, is_day_off, staff:staff_id(name, member_page_role)")
    .eq("store_id", FRANK_STORE_ID)
    .eq("date", dateStr)
    .eq("status", "published")
    .is("deleted_at", null)
    .limit(50);
  type Row = {
    staff_id: string;
    start_time: string | null;
    end_time: string | null;
    is_day_off: boolean | null;
    staff: { name?: string | null; member_page_role?: string | null } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => String(r.staff?.member_page_role ?? "").trim() !== "");
  if (rows.length === 0) return { scheduled: false, coaches: [] };
  const coaches = rows
    .filter((r) => !r.is_day_off && r.start_time && r.end_time)
    .map((r) => ({
      id: String(r.staff_id),
      name: String(r.staff?.name ?? "").trim(),
      from: String(r.start_time).slice(0, 5),
      to: String(r.end_time).slice(0, 5),
    }));
  return { scheduled: true, coaches };
}

/**
 * 予約作成の会員指定に出す候補（#189）
 *
 * ユーザー依頼「スタッフがPCで予約を取るとき、会員番号だけでなく名前でも検索したい」。
 * 会員はFRANK姫路で数百人なので**まとめて渡して画面側で絞る**（/frunk と同じ考え方）。
 * サーバーに問い合わせながら絞ると、電話を受けながら打つ速さに追いつかない。
 *
 * 退会・却下は候補に出さない（予約が取れない相手を出しても選び間違えるだけ）。
 * 休会は出す＝店頭で「今日から復帰」を受けることがあるため。
 */
export type MemberOption = {
  id: string;
  member_no: string | null;
  name: string;
  name_kana: string | null;
  phone: string | null;
  status: string | null;
  /** 法人の会社名（#206）。候補は「会社名＋お名前」で出し、会社名でも引ける */
  company_name: string | null;
};

export async function loadMemberOptions(companyId: string): Promise<MemberOption[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_members")
    .select("id, member_no, name, name_kana, phone, status, company_name")
    .eq("company_id", companyId)
    .eq("store_id", FRANK_STORE_ID)
    .in("status", ["active", "suspended"])
    .is("deleted_at", null)
    .order("member_no", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    member_no: (r.member_no as string | null) ?? null,
    name: String(r.name ?? ""),
    name_kana: (r.name_kana as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    company_name: (r.company_name as string | null) ?? null,
  }));
}

export { FRANK_STORE_ID, toMin, toTime };
