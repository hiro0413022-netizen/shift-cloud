import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { currentYM, addMonths, daysOfMonth, todayJST } from "@/lib/util";
import { buildMonthFeed, type FeedShift, type FeedEvent, type FeedTask } from "@/lib/day-feed";
import { CalendarClient } from "./calendar-client";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYM();
  const days = daysOfMonth(ym);
  const first = days[0];
  const last = days[days.length - 1];
  const today = todayJST();

  const [{ data: shifts }, { data: events }, { data: memos }, { data: tasks }] = await Promise.all([
    admin
      .from("shifts")
      .select("date, start_time, end_time, is_day_off, stores(name), shift_templates(name, color)")
      .eq("staff_id", actor.staffId)
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("date", first)
      .lte("date", last)
      .order("date"),
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
      .select("id, date, title, status, source")
      .eq("staff_id", actor.staffId)
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
        <Link href={`/shifts?ym=${ym}`} className="text-xs text-brand underline underline-offset-2">リスト表示</Link>
      </div>

      <CalendarClient ym={ym} today={today} feed={feed} />
    </div>
  );
}
