/**
 * FRANK GOLF 予約の共通定義（#93 台帳一本化）
 *
 * 予約システムが2つあった（member-osの res_* と 公開APIの frunk_*）ため、
 * 台帳を frunk_* に統合した。その際「営業時間・枠の作り方・会計のラベル」を
 * お客様側（サイト）とスタッフ側（member-os）で必ず同じにするため、ここに集約する。
 *
 *   お客様の予約 … frankgolf.jp のサイト（booking / lesson-booking / trial-booking）
 *   スタッフの管理 … member-os（/reservations・/board）
 *
 * ここはDBに依存しない純粋なロジックと、設定の読み出しだけを置く。
 */

export const FRANK_STORE_ID = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";
export const FRANK_STORE_CODE = "frunk_himeji";

/** 予約設定。gn_site_content.data.booking で上書きできる（Genesis /site-admin から変更・デプロイ不要） */
export type BookingCfg = {
  weekday: { open: string; close: string };
  weekend: { open: string; close: string };
  /** 定休曜日 0=日〜6=土 */
  closed_dows: number[];
  slot_minutes: number;
  max_minutes_options: number[];
  /** この日付は土日祝の営業時間を適用 */
  holiday_dates: string[];
  /** 臨時休業日 */
  closed_dates: string[];
  /** 何日先まで予約できるか */
  advance_days: number;
  /** 予約受付の開始日（この日より前は全予約不可）。9/2プレオープン */
  open_date: string;
  /** open_date 当日の受付開始時刻（営業openより遅い場合のみ効く） */
  open_time: string;
};

export const DEFAULT_BOOKING_CFG: BookingCfg = {
  weekday: { open: "10:00", close: "22:00" },
  weekend: { open: "09:00", close: "20:00" },
  closed_dows: [2], // 火曜定休
  slot_minutes: 30,
  max_minutes_options: [30, 60, 90, 120],
  holiday_dates: [],
  closed_dates: [],
  advance_days: 14,
  open_date: "2026-09-02", // プレオープン日
  open_time: "10:00",
};

/** Supabase の admin クライアント。
 *
 *  ★ SupabaseClient の型は非常に大きく、構造的に照合させると
 *    TS2589「型のインスタンス化が深すぎる」でビルドが落ちる。
 *    そのため受け取るときは検査せず、使う直前に必要な形へキャストする。 */
type SupabaseAdminLike = object;

type SiteContentQuery = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): { maybeSingle(): PromiseLike<{ data: unknown }> };
    };
  };
};

export async function loadBookingCfg(admin: SupabaseAdminLike): Promise<BookingCfg> {
  const q = admin as SiteContentQuery;
  const res = await q.from("gn_site_content").select("data").eq("site", "frank-golf").maybeSingle();
  const row = res?.data as { data?: unknown } | null;
  const o = ((row?.data as Record<string, unknown> | null)?.booking ?? {}) as Partial<BookingCfg>;
  return {
    ...DEFAULT_BOOKING_CFG,
    ...o,
    weekday: { ...DEFAULT_BOOKING_CFG.weekday, ...(o.weekday ?? {}) },
    weekend: { ...DEFAULT_BOOKING_CFG.weekend, ...(o.weekend ?? {}) },
  };
}

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** JSTの「今日」。サーバーはUTCなので必ずこれを使う */
export const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** その日の営業時間。定休日・臨時休業なら null */
export function businessHours(dateStr: string, cfg: BookingCfg = DEFAULT_BOOKING_CFG): { open: string; close: string } | null {
  // オープン日より前は予約枠なし（体験・打席・レッスン共通）
  if (cfg.open_date && dateStr < cfg.open_date) return null;
  if (cfg.closed_dates.includes(dateStr)) return null;
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 日付文字列のみ→曜日はUTCでOK
  if (cfg.closed_dows.includes(dow)) return null;
  const base = dow === 0 || dow === 6 || cfg.holiday_dates.includes(dateStr) ? cfg.weekend : cfg.weekday;
  // オープン初日は open_time（10:00）から。閉店時刻はその日の営業時間どおり
  if (cfg.open_date && dateStr === cfg.open_date && cfg.open_time && toMin(cfg.open_time) > toMin(base.open)) {
    return { open: cfg.open_time, close: base.close };
  }
  return base;
}

/** 予約を受け付ける日付範囲。オープン前でも「オープン日から advance_days 分」は先行予約できる */
export function bookableRange(cfg: BookingCfg = DEFAULT_BOOKING_CFG): { min: string; max: string } {
  const today = jstToday();
  const min = cfg.open_date && cfg.open_date > today ? cfg.open_date : today;
  const max = new Date(new Date(`${min}T00:00:00Z`).getTime() + cfg.advance_days * 86400_000)
    .toISOString()
    .slice(0, 10);
  return { min, max };
}

/** 営業時間から枠の開始時刻を並べる */
export function genSlots(hours: { open: string; close: string }, step: number): string[] {
  const out: string[] = [];
  for (let m = toMin(hours.open); m + step <= toMin(hours.close); m += step) out.push(toTime(m));
  return out;
}

// ------------------------------------------------------------------
// 表示ラベル（スタッフ画面・店頭カレンダーで共通に使う）
// ------------------------------------------------------------------

/** frunk_bookings.status */
export const BOOKING_STATUS_LABEL: Record<string, string> = {
  confirmed: "予約",
  visited: "来店",
  no_show: "無断欠",
  cancelled: "キャンセル",
};

/** frunk_bookings.customer_kind */
export const CUSTOMER_KIND = [
  { value: "member", label: "会員" },
  { value: "dropin", label: "都度利用" },
  { value: "trial", label: "体験" },
] as const;

export const CUSTOMER_KIND_LABEL: Record<string, string> = {
  member: "会員",
  dropin: "都度",
  trial: "体験",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "未収",
  partial: "一部入金",
  paid: "入金済",
  waived: "免除",
};

export const PAY_METHODS = [
  { value: "cash", label: "現金" },
  { value: "card", label: "カード" },
  { value: "e_money", label: "電子マネー" },
  { value: "bank", label: "振込" },
  { value: "other", label: "その他" },
] as const;

/** 未収額。免除・請求なしは0 */
export function outstanding(
  amount: number | null | undefined,
  paidAmount: number | null | undefined,
  status: string,
): number {
  if (status === "waived" || amount == null) return 0;
  const o = amount - (paidAmount ?? 0);
  return o > 0 ? o : 0;
}

/** 予約の「誰の予約か」を1つの文字列にする（会員／体験／都度で参照先が違うため） */
export function bookingWho(b: {
  customer_kind?: string | null;
  guest_name?: string | null;
  frunk_members?: { name?: string | null } | null;
  mbr_trial_requests?: { name?: string | null } | null;
  member_no?: string | null;
}): string {
  return (
    b.frunk_members?.name ??
    b.mbr_trial_requests?.name ??
    b.guest_name ??
    (b.member_no ? `会員 ${b.member_no}` : "")
  );
}
