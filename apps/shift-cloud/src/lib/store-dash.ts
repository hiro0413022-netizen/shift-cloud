import "server-only";
import { createHash } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * 店舗ダッシュボード（/store/[token]）のデータ集約
 *
 * 認証: kiosk_devices のデバイストークン（sha256ハッシュ照合・打刻キオスクと同一方式）。
 *       店頭タブレット共有表示のためスタッフログイン不要。
 * KPI:  すべて既存テーブルから直接集計（新テーブル・ビューなし）。
 *   - 体験       … mbr_trial_bookings（GOLF WING）/ mbr_trial_requests（FRANK・#72）
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

/** 会社の店舗一覧（切替タブ用） */
export async function listStores(companyId: string): Promise<StoreInfo[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("stores")
    .select("id, name")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");
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
    // GOLF WING: 体験受付（mbr_trial_bookings）。当月 = lesson_date（未確定は desired_at）
    const { data: rows } = await admin
      .from("mbr_trial_bookings")
      .select("status, joined, lesson_date, desired_at")
      .eq("company_id", companyId)
      .eq("store_id", store.id)
      .is("deleted_at", null);
    const inMonth = (b: { lesson_date: string | null; desired_at: string | null }) => {
      const d = b.lesson_date ?? (b.desired_at ? b.desired_at.slice(0, 10) : null);
      return !!d && d >= from && d < to;
    };
    const list = ((rows ?? []) as { status: string; joined: boolean; lesson_date: string | null; desired_at: string | null }[])
      .filter((b) => b.status !== "canceled" && inMonth(b));
    const visited = list.filter((b) => b.status === "visited").length;
    const joined = list.filter((b) => b.joined).length;
    trialCard = { title: `体験（${monthLabel}）`, value: `${list.length}件`, sub: `来店 ${visited}・入会 ${joined}` };
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
    // kernel.ts getBusinessBreakdown と同ロジック（スタッフ除外・トライアル区別）
    const { data: rows } = await admin
      .from("mbr_members")
      .select("member_type, join_date, leave_date");
    const inMonth = (d: string | null) => !!d && d >= from && d < to;
    let active = 0, joins = 0, leavesCore = 0, leavesTrial = 0;
    for (const m of (rows ?? []) as { member_type: string | null; join_date: string | null; leave_date: string | null }[]) {
      const type = m.member_type ?? "";
      if (type === "スタッフ") continue;
      const isTrial = type === "トライアル会員";
      if (!m.leave_date && !isTrial) active++;
      if (inMonth(m.join_date) && !isTrial) joins++;
      if (inMonth(m.leave_date)) isTrial ? leavesTrial++ : leavesCore++;
    }
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
  staff_name: string;
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
      .select("date, start_time, end_time, is_day_off, staff(name), shift_templates(color)")
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
    // 体験予約（確定日ベース・キャンセル除く）→ 予約●として合流
    admin
      .from("mbr_trial_bookings")
      .select("lesson_date, start_time, program, status")
      .eq("company_id", companyId)
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .not("lesson_date", "is", null)
      .gte("lesson_date", first)
      .lte("lesson_date", last),
  ]);

  const feed: StoreMonthFeed = {};
  for (const d of days) feed[d] = { shifts: [], events: [], tasks: [], reservations: [] };

  for (const s of (shiftRes.data ?? []) as unknown as {
    date: string; start_time: string | null; end_time: string | null; is_day_off: boolean;
    staff: { name: string } | null; shift_templates: { color: string } | null;
  }[]) {
    feed[s.date]?.shifts.push({
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      is_day_off: s.is_day_off,
      staff_name: s.staff?.name ?? "?",
      template_color: s.shift_templates?.color ?? null,
    });
  }
  for (const e of (eventRes.data ?? []) as StoreEvent[]) feed[e.date]?.events.push(e);
  for (const t of (taskRes.data ?? []) as StoreTask[]) feed[t.date]?.tasks.push(t);
  for (const r of (trialRes.data ?? []) as { lesson_date: string; start_time: string | null; program: string | null; status: string }[]) {
    if (r.status === "canceled") continue;
    const hm = r.start_time ? r.start_time.slice(0, 5) : "";
    feed[r.lesson_date]?.reservations.push({ date: r.lesson_date, label: `体験 ${hm}${r.program ? ` ${r.program}` : ""}`.trim() });
  }
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
