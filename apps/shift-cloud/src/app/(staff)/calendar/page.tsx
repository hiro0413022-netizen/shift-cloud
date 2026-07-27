import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { currentYM, addMonths, daysOfMonth, todayJST } from "@/lib/util";
import { buildMonthFeed, type FeedShift, type FeedCoworker, type FeedEvent, type FeedTask } from "@/lib/day-feed";
import { CalendarClient } from "./calendar-client";
import { taskScopeFilter } from "@/lib/task-scope";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYM();
  const days = daysOfMonth(ym);
  const first = days[0];
  const last = days[days.length - 1];
  const today = todayJST();

  const [{ data: shifts }, { data: coworkers }, { data: events }, { data: memos }, { data: tasks }] = await Promise.all([
    admin
      .from("shifts")
      .select("date, start_time, end_time, is_day_off, stores(name), shift_templates(name, color)")
      .eq("staff_id", actor.staffId)
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last)
      .order("date"),
    // 店舗全体の出勤者（自分以外も含む・確定分のみ）。所属店舗がゼロなら空で返す
    actor.storeIds.length
      ? admin
          .from("shifts")
          .select("date, staff_id, start_time, end_time, is_day_off, staff(name), stores(name)")
          .eq("company_id", actor.companyId)
          .in("store_id", actor.storeIds)
          .eq("status", "published")
          .is("deleted_at", null)
          .gte("date", first)
          .lte("date", last)
          .order("date")
          .order("start_time")
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin
      .from("store_events")
      .select("date, title, start_time, stores(name)")
      .in("store_id", actor.storeIds.length ? actor.storeIds : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last)
      .order("date"),
    admin
      .from("sp_calendar_memos")
      .select("date, memo")
      .eq("staff_id", actor.staffId)
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last),
    admin
      .from("sp_tasks")
      // 自分あて + 店舗共通（予約申込など / DECISIONS #55）
      .select("id, date, title, note, status, source, staff_id")
      .eq("company_id", actor.companyId)
      .or(taskScopeFilter(actor.staffId, actor.storeIds))
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last)
      .order("sort"),
  ]);

  const feed = buildMonthFeed(days, {
    shifts: (shifts ?? []).map((s): FeedShift => ({
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      is_day_off: s.is_day_off,
      store_name: (s.stores as unknown as { name: string } | null)?.name ?? null,
      template_name: (s.shift_templates as unknown as { name: string } | null)?.name ?? null,
      template_color: (s.shift_templates as unknown as { color: string } | null)?.color ?? null,
    })),
    coworkers: ((coworkers ?? []) as unknown as {
      date: string; staff_id: string; start_time: string | null; end_time: string | null;
      is_day_off: boolean; staff: { name: string } | null; stores: { name: string } | null;
    }[]).map((c): FeedCoworker => ({
      date: c.date,
      staff_name: c.staff?.name ?? "（不明）",
      start_time: c.start_time,
      end_time: c.end_time,
      is_day_off: c.is_day_off,
      store_name: c.stores?.name ?? null,
      is_self: c.staff_id === actor.staffId,
    })),
    events: (events ?? []).map((e): FeedEvent => ({
      date: e.date,
      title: e.title,
      start_time: e.start_time,
      store_name: (e.stores as unknown as { name: string } | null)?.name ?? null,
    })),
    memos: memos ?? [],
    tasks: (tasks ?? []) as FeedTask[],
    // reservations: Reserve OS / 体験予約 / Smart Hello をここに合流させる（lib/day-feed.ts参照）
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/calendar?ym=${addMonths(ym, -1)}`} className="rounded-md border border-zinc-200 px-2.5 py-1 text-zinc-500">←</Link>
          <p className="text-lg font-semibold tracking-tight">{ym.replace("-", "年")}月</p>
          <Link href={`/calendar?ym=${addMonths(ym, 1)}`} className="rounded-md border border-zinc-200 px-2.5 py-1 text-zinc-500">→</Link>
        </div>
        {/* 全体シフトの導線（下部ナビの「シフト」タブがカレンダーに置き換わって消えていた） */}
        <Link
          href={`/shifts?ym=${ym}&view=all`}
          className="rounded-md border border-brand px-2.5 py-1 text-xs font-medium text-brand"
        >
          全員のシフト
        </Link>
      </div>

      <CalendarClient ym={ym} today={today} feed={feed} />
    </div>
  );
}
