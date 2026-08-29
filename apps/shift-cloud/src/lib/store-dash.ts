import "server-only";
import { createHash } from "crypto";
import { memberStats } from "@yozan/core/members";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * 店舗ダッシュボード（/store/[token]）のデータ集約
 *
 * 認証: kiosk_devices のデバイストークン（sha256ハッシュ照合・打刻キオスクと同一方式）。
 *       店頭タブレット共有表示のためスタッフログイン不要。
 * KPI:  すべて既存テーブルから直接集計（新テーブル・ビューなし）。
 *   - 体験       … mbr_walkin_visits visit_type='trial'（GOLF WING・#93）/ mbr_trial_requests（FRANK・#72）
 *   - 物販売上   … mon_sales category='販売'（税抜・月次サマリ）
 *   - 会員       … mbr_members（GOLF WING・kernel.tsと同ロジック）/ frunk_members（FRANK）
 *   - 売上見込   … mon_sales当月合計 + fin_entries source='forecast'（月会費予測 0028）
 * 日付は必ずJST（lib/util）。
 */

export type StoreDevice = {
  deviceId: string;
  companyId: string;
  storeId: string;
  storeName: string;
};

export type StoreInfo = { id: string; name: string };

export type KpiCard = {
  title: string;
  value: string;
  sub: string;
  tone?: "default" | "muted";
};

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

/** デバイストークン検証（kiosk と同一方式・共有タブレット前提） */
export async function verifyStoreDevice(token: string): Promise<StoreDevice | null> {
  const admin = createAdmin();
  const { data: device } = await admin
    .from("kiosk_devices")
    .select("id, company_id, store_id, status, stores(name)")
    .eq("token_hash", sha256(token))
    .is("deleted_at", null)
    .maybeSingle();
  if (!device || device.status !== "active" || !device.store_id) return null;
  return {
    deviceId: device.id,
    companyId: device.company_id,
    storeId: device.store_id,
    storeName: (device.stores as unknown as { name: string } | null)?.name ?? "",
  };
}

/**
 * 切替タブ用の店舗一覧（#134）。
 * 店舗ダッシュボードは「認証で解決した店舗」に固定するのが正典（#128 店舗またぎ廃止）。
 * allowedIds を渡すとその店舗だけを返す。全店を返してよいのはオーナー（manage_company）のときだけ。
 */
export async function listStores(companyId: string, allowedIds?: string[]): Promise<StoreInfo[]> {
  const admin = createAdmin();
  let q = admin
    .from("stores")
    .select("id, name")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");
  // 空配列を .in() に渡すと壊れるので、絶対に一致しないUUIDに置き換える
  if (allowedIds) q = q.in("id", allowedIds.length > 0 ? allowedIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  return (data ?? []) as StoreInfo[];
}

/** 店舗判別: GOLF WING系かFRANK系か（KPIソースが異なる） */
export function isGolfWing(storeName: string): boolean {
  const n = storeName.toUpperCase();
  return n.includes("GOLF WING") || n.includes("ゴルフウィング") || n.includes("宝塚");
}

// ============================================================
// KPI（今月・店舗別）
// ============================================================

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

/** [月初, 翌月初) を返す（ym = "YYYY-MM"） */
function monthWindow(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${ym}-01`, to: `${next}-01` };
}

export async function getStoreKpis(companyId: string, store: StoreInfo, ym: string): Promise<KpiCard[]> {
  const admin = createAdmin();
  const { from, to } = monthWindow(ym);
  const monthLabel = `${Number(ym.slice(5))}月`;
  const gw = isGolfWing(store.name);

  // --- 体験（今月） ---
  let trialCard: KpiCard;
  if (gw) {
    // GOLF WING: 一時利用者名簿（mbr_walkin_visits・visit_type='trial'）。
    // 体験の実績はここに入る（旧 mbr_trial_bookings は 0018 で台帳へ移行済＝常に空・#93）。
    const { data: rows } = await admin
      .from("mbr_walkin_visits")
      .select("result, visited_on")
      .eq("company_id", companyId)
      .eq("store_id", store.id)
      .eq("visit_type", "trial")
      .is("deleted_at", null)
      .gte("visited_on", from)
      .lt("visited_on", to);
    const list = (rows ?? []) as { result: string | null }[];
    const joined = list.filter((b) => b.result === "join").length;
    const rate = list.length > 0 ? Math.round((joined / list.length) * 100) : 0;
    trialCard = { title: `体験（${monthLabel}）`, value: `${list.length}件`, sub: `入会 ${joined}・入会率 ${rate}%` };
  } else {
    // FRANK: 体験申込（mbr_trial_requests / #72）。当月 = 申込日（created_at・JSTはDB側timestamptzで十分近似）
    const { data: rows } = await admin
      .from("mbr_trial_requests")
      .select("status, created_at")
      .eq("company_id", companyId)
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .gte("created_at", `${from}T00:00:00+09:00`)
      .lt("created_at", `${to}T00:00:00+09:00`);
    const list = (rows ?? []) as { status: string }[];
    const active = list.filter((r) => r.status !== "canceled");
    const pending = active.filter((r) => r.status === "pending").length;
    const confirmed = active.filter((r) => r.status === "confirmed").length;
    const done = active.filter((r) => r.status === "done").length;
    trialCard = { title: `体験申込（${monthLabel}）`, value: `${active.length}件`, sub: `未対応 ${pending}・確定 ${confirmed}・来店 ${done}` };
  }

  // --- 物販売上（mon_sales category='販売'・税抜） ---
  // 台帳取込は月次のため当月分が無いことがある → 最新実績月をフォールバック表示
  const { data: goodsRows } = await admin
    .from("mon_sales")
    .select("amount, sold_on")
    .eq("company_id", companyId)
    .eq("store_id", store.id)
    .eq("category", "販売")
    .is("deleted_at", null)
    .order("sold_on", { ascending: false });
  const goods = (goodsRows ?? []) as { amount: number | string; sold_on: string }[];
  const goodsThisMonth = goods.filter((g) => g.sold_on >= from && g.sold_on < to);
  let goodsCard: KpiCard;
  if (goodsThisMonth.length > 0) {
    const sum = goodsThisMonth.reduce((s, g) => s + (Number(g.amount) || 0), 0);
    goodsCard = { title: `物販売上（${monthLabel}）`, value: yen(sum), sub: "税抜・台帳取込分" };
  } else if (goods.length > 0) {
    const latestYm = goods[0].sold_on.slice(0, 7);
    const w = monthWindow(latestYm);
    const sum = goods.filter((g) => g.sold_on >= w.from && g.sold_on < w.to).reduce((s, g) => s + (Number(g.amount) || 0), 0);
    goodsCard = { title: "物販売上", value: yen(sum), sub: `${Number(latestYm.slice(5))}月実績（当月は台帳取込待ち）`, tone: "muted" };
  } else {
    goodsCard = { title: `物販売上（${monthLabel}）`, value: "—", sub: "データ未接続", tone: "muted" };
  }

  // --- 会員（在籍・今月入会/退会） ---
  let memberCard: KpiCard;
  if (gw) {
    // 会員集計の正典は @yozan/core/members（#84・kernel.tsと共通）
    // TODO(#134): mbr_members は store_id を持たず店舗はテキスト（store_name）なので、
    //   会社で絞るところまでしかできない。姫路(FRANK)は frunk_members 側なので現状は実害なしだが、
    //   GOLF WING 2号店が出たら合算になる。会員名簿に store_id を持たせて .eq("store_id", store.id) に差し替える。
    const { data: rows } = await admin
      .from("mbr_members")
      .select("member_type, join_date, leave_date")
      .eq("company_id", companyId);
    const { active, joins, leavesCore, leavesTrial } = memberStats(
      (rows ?? []) as { member_type: string | null; join_date: string | null; leave_date: string | null }[],
      from,
      to,
    );
    memberCard = { title: "会員（本会員）", value: `${active}人`, sub: `${monthLabel}入会 ${joins}・退会 ${leavesCore}（ﾄﾗｲｱﾙ退会 ${leavesTrial}）` };
  } else {
    const { data: rows } = await admin
      .from("frunk_members")
      .select("status, join_date")
      .eq("company_id", companyId)
      .eq("store_id", store.id)
      .is("deleted_at", null);
    const list = (rows ?? []) as { status: string; join_date: string | null }[];
    const active = list.filter((m) => m.status === "active").length;
    const pending = list.filter((m) => m.status === "pending").length;
    const joins = list.filter((m) => m.join_date && m.join_date >= from && m.join_date < to).length;
    memberCard = { title: "会員（FRANK）", value: `${active}人`, sub: `承認待ち ${pending}・${monthLabel}入会 ${joins}` };
  }

  // --- 売上見込（今月）: mon_sales当月合計 + 月会費予測（fin_entries source='forecast' / 0028） ---
  let forecastCard: KpiCard;
  if (gw) {
    const { data: salesRows } = await admin
      .from("mon_sales")
      .select("amount")
      .eq("company_id", companyId)
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .gte("sold_on", from)
      .lt("sold_on", to);
    const salesSum = ((salesRows ?? []) as { amount: number | string }[]).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const { data: fcRows } = await admin
      .from("fin_entries")
      .select("amount")
      .eq("company_id", companyId)
      .eq("source", "forecast")
      .eq("target_month", from)
      .is("deleted_at", null);
    const fcSum = ((fcRows ?? []) as { amount: number | string }[]).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    forecastCard = fcSum + salesSum > 0
      ? { title: `売上見込（${monthLabel}）`, value: yen(salesSum + fcSum), sub: "月会費予測込・税抜" }
      : { title: `売上見込（${monthLabel}）`, value: "—", sub: "予測未生成", tone: "muted" };
  } else {
    forecastCard = { title: `売上見込（${monthLabel}）`, value: "—", sub: "開業準備中", tone: "muted" };
  }

  return [trialCard, goodsCard, memberCard, forecastCard];
}

// ============================================================
// 月間フィード（店舗単位: 全スタッフのシフト＋イベント＋店舗共通タスク＋体験予約）
// ============================================================

export type StoreShift = {
  date: string;
  start_time: string | null;
  end_time: string | null;
  is_day_off: boolean;
  staff_id: string | null;
  staff_name: string;
  /** staff.sort_order（スタッフ管理の▲▼／店舗ダッシュボードのドラッグで決まる行順・#147/#171）。同値なら氏名順 */
  staff_sort: number;
  template_color: string | null;
};

export type StoreTask = {
  id: string;
  date: string;
  title: string;
  note: string | null;
  status: "open" | "done";
  source: string;
};

export type StoreEvent = { date: string; title: string; start_time: string | null };
export type StoreReservation = { date: string; label: string };

export type StoreDayFeed = {
  shifts: StoreShift[];
  events: StoreEvent[];
  tasks: StoreTask[];
  reservations: StoreReservation[];
};

export type StoreMonthFeed = Record<string, StoreDayFeed>;

export async function getStoreMonthFeed(
  companyId: string,
  storeId: string,
  days: string[]
): Promise<StoreMonthFeed> {
  const admin = createAdmin();
  const first = days[0];
  const last = days[days.length - 1];

  const [shiftRes, eventRes, taskRes, trialRes] = await Promise.all([
    admin
      .from("shifts")
      .select("date, start_time, end_time, is_day_off, staff(id, name, sort_order), shift_templates(color)")
      .eq("company_id", companyId)
      .eq("store_id", storeId)
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last)
      .order("date")
      .order("start_time"),
    admin
      .from("store_events")
      .select("date, title, start_time")
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last)
      .order("date"),
    // 店舗共通タスクのみ（staff_id null / DECISIONS #55）。個人タスクは共有画面に出さない
    admin
      .from("sp_tasks")
      .select("id, date, title, note, status, source")
      .eq("company_id", companyId)
      .eq("store_id", storeId)
      .is("staff_id", null)
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last)
      .order("sort"),
    // 体験（一時利用者名簿の実績・#93）→ 予約●として合流。GW は予約テーブルを持たないため来店日ベース
    admin
      .from("mbr_walkin_visits")
      .select("visited_on, visit_type")
      .eq("company_id", companyId)
      .eq("store_id", storeId)
      .eq("visit_type", "trial")
      .is("deleted_at", null)
      .gte("visited_on", first)
      .lte("visited_on", last),
  ]);

  const feed: StoreMonthFeed = {};
  for (const d of days) feed[d] = { shifts: [], events: [], tasks: [], reservations: [] };

  for (const s of (shiftRes.data ?? []) as unknown as {
    date: string; start_time: string | null; end_time: string | null; is_day_off: boolean;
    staff: { id: string; name: string; sort_order: number | null } | null; shift_templates: { color: string } | null;
  }[]) {
    feed[s.date]?.shifts.push({
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      is_day_off: s.is_day_off,
      staff_id: s.staff?.id ?? null,
      staff_name: s.staff?.name ?? "?",
      staff_sort: s.staff?.sort_order ?? 0,
      template_color: s.shift_templates?.color ?? null,
    });
  }
  for (const e of (eventRes.data ?? []) as StoreEvent[]) feed[e.date]?.events.push(e);
  for (const t of (taskRes.data ?? []) as StoreTask[]) feed[t.date]?.tasks.push(t);
  for (const r of (trialRes.data ?? []) as { visited_on: string }[]) {
    feed[r.visited_on]?.reservations.push({ date: r.visited_on, label: "体験" });
  }

  // FRANK: 打席予約＋レッスン予約も予約欄に合流（#88 §3-3/3-4・店頭タブレットで当日予約を見る）
  const [bayRes, lessonRes] = await Promise.all([
    admin
      .from("frunk_bookings")
      .select("booked_date, start_time, end_time, status, customer_kind, guest_name, frunk_members(name), frunk_bays(name), mbr_trial_requests(name)")
      .eq("store_id", storeId)
      // 来店済み・無断欠も当日の予定として出す。消えるのはキャンセルだけ（0084）
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .gte("booked_date", first)
      .lte("booked_date", last)
      .order("start_time"),
    admin
      .from("frunk_lesson_bookings")
      .select("status, frunk_members(name), frunk_lesson_slots!inner(slot_date, start_time, staff(name))")
      .eq("store_id", storeId)
      .in("status", ["confirmed", "done"])
      .is("deleted_at", null)
      .gte("frunk_lesson_slots.slot_date", first)
      .lte("frunk_lesson_slots.slot_date", last),
  ]);
  for (const b of (bayRes.data ?? []) as unknown as {
    booked_date: string; start_time: string; end_time: string; customer_kind: string; guest_name: string | null;
    frunk_members: { name: string } | null; frunk_bays: { name: string } | null;
    mbr_trial_requests: { name: string } | null;
  }[]) {
    // 会員・体験・都度で呼び名が違う（0084で台帳を一本化）
    const who = b.frunk_members?.name ?? b.mbr_trial_requests?.name ?? b.guest_name ?? "";
    const kind = b.customer_kind === "trial" ? "体験" : b.customer_kind === "dropin" ? "都度" : "打席";
    feed[b.booked_date]?.reservations.push({
      date: b.booked_date,
      label: `${kind} ${String(b.start_time).slice(0, 5)} ${who}${who ? "様" : ""}${b.frunk_bays ? `（${b.frunk_bays.name}）` : ""}`.trim(),
    });
  }
  for (const l of (lessonRes.data ?? []) as unknown as {
    frunk_members: { name: string } | null;
    frunk_lesson_slots: { slot_date: string; start_time: string; staff: { name: string } | null };
  }[]) {
    const d = l.frunk_lesson_slots.slot_date;
    feed[d]?.reservations.push({
      date: d,
      label: `レッスン ${String(l.frunk_lesson_slots.start_time).slice(0, 5)} ${l.frunk_members?.name ?? ""}様${l.frunk_lesson_slots.staff ? `（${l.frunk_lesson_slots.staff.name}）` : ""}`.trim(),
    });
  }
  const timeOf = (label: string) => /(\d{2}:\d{2})/.exec(label)?.[1] ?? "99:99";
  for (const d of days) feed[d].reservations.sort((a, b) => timeOf(a.label).localeCompare(timeOf(b.label)));
  return feed;
}

// ============================================================
// 業務リンク集（sp_links: 全社共通 + 対象店舗）
// ============================================================

export type StoreLink = { id: string; label: string; url: string; note: string | null };

export async function getStoreLinks(companyId: string, storeId: string): Promise<StoreLink[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sp_links")
    .select("id, label, url, note, store_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("sort");
  return ((data ?? []) as (StoreLink & { store_id: string | null })[])
    .filter((l) => !l.store_id || l.store_id === storeId)
    .map(({ id, label, url, note }) => ({ id, label, url, note }));
}

// ============================================================
// フィッティング（Reserve OS 申込 → 受付台帳）— 画面上部の常設パネル（DECISIONS #186）
//
// なぜ日付マスではなく上部固定なのか（ユーザー決定 2026-08-29）:
//   申込は「やること」として **申込を受けた日のマス** にしか出ず、確定すると done で消えていた。
//   実際に R-0004（8/25申込・希望8/29）は4日間 pending のまま放置され、当日ご来店された。
//   折り返し待ちは日付に埋めてはいけない。開いた瞬間に見える場所に出す。
// ============================================================

/** 他アプリのURL。Vercelのプロジェクト名が変わったら env で上書きする */
export const MEMBER_OS_URL = process.env.MEMBER_OS_URL || "https://member-os-tau.vercel.app";
export const RESERVE_OS_URL = process.env.RESERVE_OS_URL || "https://shift-cloud-reserve-os.vercel.app";

export type FittingPending = {
  requestId: string;
  seq: string;          // R-0004
  name: string;
  phone: string | null;
  serviceName: string | null;
  prefs: string[];      // 第1〜3希望（JST整形済み）
  waitingDays: number;  // 申込から何日経ったか
};

export type FittingToday = {
  visitId: string;
  name: string;
  phone: string | null;
  note: string | null;
  time: string | null;   // 予約時刻 HH:MM
  arrived: boolean;      // 来店ボタンを押したか
  filled: boolean;       // 受付フォームの記入が済んだか（consent_at）
};

export type FittingBoard = { pending: FittingPending[]; today: FittingToday[] };

const JST_TZ = "Asia/Tokyo";

/** timestamptz(ISO) → "8/30(日) 11:00"（JST） */
function fmtPref(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: JST_TZ, month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

function hhmm(iso: unknown): string | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("ja-JP", { timeZone: JST_TZ, hour: "2-digit", minute: "2-digit" });
}

/** 申込からの経過日数（JSTの日付差） */
function daysSince(iso: unknown, today: string): number {
  const ymd = iso
    ? new Intl.DateTimeFormat("en-CA", { timeZone: JST_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(String(iso)))
    : today;
  const a = Date.parse(`${ymd}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export async function getFittingBoard(companyId: string, storeId: string, today: string): Promise<FittingBoard> {
  const admin = createAdmin();

  const [reqRes, visitRes] = await Promise.all([
    // 未対応の申込（日付に関係なく全部。折り返しが済むまで消えない）
    admin
      .from("res_requests")
      .select("id, request_seq, name, phone, service_name, pref1_at, pref2_at, pref3_at, created_at")
      .eq("company_id", companyId)
      .eq("store_id", storeId)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(30),
    // 本日ご来店予定（確定した瞬間に台帳へ入る・0135 / fitting-walkin.ts）
    admin
      .from("mbr_walkin_visits")
      .select("id, note, arrived_at, consent_at, survey, mbr_guests(name, phone, mobile)")
      .eq("company_id", companyId)
      .eq("store_id", storeId)
      .eq("visit_type", "fitting")
      .eq("visited_on", today)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(30),
  ]);

  const reqRows = (reqRes.data ?? []) as unknown as {
    id: string; request_seq: number | null; name: string | null; phone: string | null;
    service_name: string | null; pref1_at: string | null; pref2_at: string | null; pref3_at: string | null;
    created_at: string;
  }[];

  const pending: FittingPending[] = reqRows.map((r) => ({
    requestId: String(r.id),
    seq: `R-${String(r.request_seq ?? "").padStart(4, "0")}`,
    name: String(r.name ?? ""),
    phone: r.phone ?? null,
    serviceName: r.service_name ?? null,
    prefs: [r.pref1_at, r.pref2_at, r.pref3_at].filter(Boolean).map(fmtPref),
    waitingDays: daysSince(r.created_at, today),
  }));

  const todayRows = (visitRes.data ?? []) as unknown as {
    id: string; note: string | null; arrived_at: string | null; consent_at: string | null;
    survey: { reserve?: { confirmed_at?: string | null } } | null;
    mbr_guests: { name: string; phone: string | null; mobile: string | null } | null;
  }[];

  const list: FittingToday[] = todayRows.map((v) => ({
    visitId: v.id,
    name: v.mbr_guests?.name ?? "（お名前未登録）",
    phone: v.mbr_guests?.mobile || v.mbr_guests?.phone || null,
    note: v.note,
    time: hhmm(v.survey?.reserve?.confirmed_at ?? null),
    arrived: v.arrived_at != null,
    filled: v.consent_at != null,
  }));
  list.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));

  return { pending, today: list };
}
