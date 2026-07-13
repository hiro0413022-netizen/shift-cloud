/**
 * 日別フィード（DECISIONS #48）
 *
 * カレンダーは「date をキーにした日別フィード」に複数ソースを合流させる方式。
 * 現在のソース: shifts / store_events / sp_calendar_memos / sp_tasks
 * 将来のソース: Reserve OS（rsv_*）・体験予約（mbr_trial_bookings）・Smart Hello取込。
 * → reservations: FeedReservation[] に詰めるだけで画面側は対応済み。FKでは結合しない。
 */

export type FeedShift = {
  date: string;
  start_time: string | null;
  end_time: string | null;
  is_day_off: boolean;
  store_name: string | null;
  template_name: string | null;
  template_color: string | null;
};

export type FeedEvent = {
  date: string;
  title: string;
  start_time: string | null;
  store_name: string | null;
};

export type FeedTask = {
  id: string;
  date: string;
  title: string;
  status: "open" | "done";
  source: string;
};

/** 予約系ソースの共通形。Reserve OS / 体験予約 / Smart Hello をここに正規化して差し込む */
export type FeedReservation = {
  date: string;
  time: string | null;
  label: string;   // 例: "シャフトFT 14:00 田中様" / "体験予約 2件"
  source: "reserve_os" | "member_os" | "smart_hello";
};

export type DayFeed = {
  shifts: FeedShift[];
  events: FeedEvent[];
  tasks: FeedTask[];
  reservations: FeedReservation[];
  memo: string | null;
};

export type MonthFeed = Record<string, DayFeed>;

export function buildMonthFeed(
  days: string[],
  sources: {
    shifts?: FeedShift[];
    events?: FeedEvent[];
    tasks?: FeedTask[];
    reservations?: FeedReservation[];
    memos?: { date: string; memo: string }[];
  }
): MonthFeed {
  const feed: MonthFeed = {};
  for (const d of days) feed[d] = { shifts: [], events: [], tasks: [], reservations: [], memo: null };
  for (const s of sources.shifts ?? []) feed[s.date]?.shifts.push(s);
  for (const e of sources.events ?? []) feed[e.date]?.events.push(e);
  for (const t of sources.tasks ?? []) feed[t.date]?.tasks.push(t);
  for (const r of sources.reservations ?? []) feed[r.date]?.reservations.push(r);
  for (const m of sources.memos ?? []) if (feed[m.date]) feed[m.date].memo = m.memo;
  return feed;
}
