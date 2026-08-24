import Link from "next/link";
import { loadDay, loadMonthCounts, loadBookingDetail, loadLessonDetail, type DayView } from "@/lib/frank-reservation";
import { BookingDetailPanel, LessonDetailPanel } from "@/components/booking-detail";
import { businessHours, genSlots, jstToday } from "@yozan/core/frank-booking";
import {
  addDaysStr,
  addMonths,
  labelJa,
  monthOf,
  toTimelineItems,
  weekStart,
  type TimelineItem,
} from "@/lib/bay-timeline-pure";
import { BayTimeline, WeekTimeline, TimelineLegend, type WeekDay } from "@/components/bay-timeline";
import { MonthMiniCalendar, CalendarViewSwitch, MonthCalendar, type CalendarView } from "@/components/month-picker";

/**
 * FRANK GOLF 姫路 予約カレンダー（店舗ダッシュボード・#129 → #135で作り直し）
 *
 * ★ #135: Smart Hello（GOLF WINGの現行システム）と同じ見た目にした（ユーザー指示 2026-08-13）
 *   - 縦＝時間・横＝打席（それまでは横が時間だった＝転置）
 *   - 左に月のミニカレンダー、その下に 月/週/日 の切替・表示時刻（粒度）・表示方法
 *   - 予約は所要時間ぶんの高さを持つ色付きブロック（rowSpan）
 *   描画そのものは @/components/bay-timeline に集約（/reservations と共通・色も1か所）
 */

const LESSON_OS_URL = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";

const btn =
  "rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-dim) hover:text-(--color-txt)";

export async function FrankCalendarDashboard({
  date,
  view,
  step,
  companyId,
  extraQuery = "",
  sel = null,
}: {
  date: string;
  view: CalendarView;
  /** 縦軸の刻み（分）。?step= で切り替える */
  step: number;
  companyId: string; // 会社＋FRANK店舗で必ず絞るため（#134）
  extraQuery?: string; // オーナーの店舗切替(?store=frank)を維持するため
  /** ?sel= 詳細を開いている予約（#139）。`lesson:<id>` はレッスン枠 */
  sel?: string | null;
}) {
  const today = jstToday();
  const month = monthOf(date);

  // 週は日曜はじまり（Smart Helloと同じ）。日表示なら当日だけ。
  const weekFrom = weekStart(date);
  const days =
    view === "week" ? Array.from({ length: 7 }, (_, i) => addDaysStr(weekFrom, i)) : view === "day" ? [date] : [];

  const [dayViews, monthData] = await Promise.all([
    Promise.all(days.map((d) => loadDay(d, companyId))),
    loadMonthCounts(month, companyId),
  ]);
  const { cfg, counts } = monthData;
  const isClosed = (d: string) => businessHours(d, cfg) === null;

  const href = (p: { date?: string; view?: CalendarView; month?: string; step?: number; sel?: string }) => {
    const d = p.date ?? date;
    const v = p.view ?? view;
    const s = p.step ?? step;
    const base = `/dashboard?date=${d}&view=${v}&step=${s}${extraQuery}`;
    return p.sel ? `${base}&sel=${encodeURIComponent(p.sel)}#booking-detail` : base;
  };
  // カレンダーの名前を押したら詳細（#139）。レッスン枠は id が `lesson:<uuid>` なのでそのまま渡す
  const itemHref = (item: TimelineItem, d?: string) => href({ date: d ?? date, sel: item.id });
  const detail = await loadSelection(sel, companyId);
  // 「前へ/次へ」の刻みは表示中の単位に合わせる（日=1日・週=7日・月=1か月）
  const prevHref =
    view === "month"
      ? href({ date: `${addMonths(month, -1)}-01`, month: addMonths(month, -1) })
      : href({ date: addDaysStr(date, view === "week" ? -7 : -1) });
  const nextHref =
    view === "month"
      ? href({ date: `${addMonths(month, 1)}-01`, month: addMonths(month, 1) })
      : href({ date: addDaysStr(date, view === "week" ? 7 : 1) });

  const hidden = extraQuery.includes("store=frank") ? [{ name: "store", value: "frank" }] : [];

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">予約カレンダー</h1>
          <p className="mt-0.5 text-sm text-(--color-dim)">FRANK GOLF 姫路 ・ 体験/会員/都度/レッスンの予約状況</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={prevHref} className={btn} aria-label="前へ">←</Link>
          <form className="flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="step" value={String(step)} />
            {hidden.map((h) => (
              <input key={h.name} type="hidden" name={h.name} value={h.value} />
            ))}
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
            />
            <button className={btn}>表示</button>
          </form>
          <Link href={nextHref} className={btn} aria-label="次へ">→</Link>
          <Link href={href({ date: today, month: monthOf(today) })} className={btn}>今日</Link>
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 左サイド: 月ミニカレンダー → 月/週/日 → 表示時刻 → 表示方法（Smart Helloと同じ並び） */}
        <aside className="reveal w-full shrink-0 space-y-3 lg:w-60">
          <MonthMiniCalendar
            month={month}
            selected={date}
            today={today}
            href={href}
            view={view}
            counts={counts}
            isClosed={isClosed}
          />
          <CalendarViewSwitch view={view} step={step} date={date} href={href} hidden={hidden} />
          <div className="flex flex-col gap-1.5 text-xs">
            <a href={`${LESSON_OS_URL}/frank`} target="_blank" rel="noreferrer" className={btn}>🎯 レッスン管理システム ↗</a>
            <Link href={`/reservations?date=${date}`} className={btn}>予約の登録・入金（予約管理）</Link>
            <Link href="/frunk" className={btn}>FRANK会員（重要説明事項の記入）</Link>
            <Link href="/board" target="_blank" className={btn}>ロビー掲示用カレンダー ↗</Link>
          </div>
        </aside>

        <div className="reveal min-w-0 flex-1 space-y-3">
          <h2 className="text-sm font-semibold">
            {view === "month"
              ? `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`
              : view === "week"
                ? `${labelJa(weekFrom)} 〜 ${labelJa(addDaysStr(weekFrom, 6))}`
                : labelJa(date)}
            {view !== "month" && date === today && (
              <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">今日</span>
            )}
          </h2>

          {detail && (
            <div id="booking-detail">
              {detail.kind === "booking" ? (
                <BookingDetailPanel
                  b={detail.booking}
                  backHref={href({})}
                  date={detail.booking.booked_date}
                  bays={(dayViews[0]?.bays ?? []).filter((x) => x.active).map((x) => ({ id: x.id, name: x.name }))}
                />
              ) : (
                <LessonDetailPanel l={detail.lesson} backHref={href({})} />
              )}
            </div>
          )}

          {view === "month" ? (
            <MonthCalendar month={month} today={today} counts={counts} href={href} isClosed={isClosed} />
          ) : view === "week" ? (
            <WeekTimeline
              days={dayViews.map(toWeekDay)}
              step={step}
              bayCount={dayViews[0]?.bays.filter((b) => b.active).length ?? 0}
              hrefDay={(d) => href({ date: d, view: "day", month: monthOf(d) })}
              today={today}
              itemHref={(item, d) => itemHref(item, d)}
            />
          ) : (
            <DayCalendar view0={dayViews[0]} step={step} isToday={date === today} itemHref={itemHref} selectedId={sel} />
          )}

          <TimelineLegend>
            <span>予約の名前を押すと詳細（連絡先・会計・来店処理）が開きます</span>
            <span>⚠ = 重要説明事項あり（FRANK会員画面で記入・確認）</span>
          </TimelineLegend>
        </div>
      </div>
    </div>
  );
}

function toWeekDay(v: DayView): WeekDay {
  return {
    date: v.date,
    closed: v.closed,
    slots: v.slots,
    items: toTimelineItems(v.bookings, v.lessons),
  };
}

/** 現在時刻（JSTの分）。サーバーはUTCなので +9h してから読む（JST日付ルール #73） */
function jstNowMin(): number {
  const now = new Date(Date.now() + 9 * 3600_000);
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/** ?sel= の中身を詳細データに変える。`lesson:<uuid>` はレッスン枠、それ以外は予約ID */
async function loadSelection(sel: string | null | undefined, companyId: string) {
  const raw = (sel ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("lesson:")) {
    const l = await loadLessonDetail(raw.slice("lesson:".length), companyId);
    return l ? ({ kind: "lesson", lesson: l } as const) : null;
  }
  const b = await loadBookingDetail(raw, companyId);
  return b ? ({ kind: "booking", booking: b } as const) : null;
}

function DayCalendar({
  view0,
  step,
  isToday,
  itemHref,
  selectedId,
}: {
  view0: DayView;
  step: number;
  isToday: boolean;
  itemHref?: (item: TimelineItem) => string | undefined;
  selectedId?: string | null;
}) {
  if (view0.closed || !view0.hours) {
    return (
      <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-10 text-center text-lg text-(--color-dim)">
        {labelJa(view0.date)} は定休日です
      </div>
    );
  }
  const bays = view0.bays.filter((b) => b.active);
  // 表示粒度（?step=）は予約設定の刻みと独立。15分表示にしても予約は30分刻みのまま。
  const slots = genSlots(view0.hours, step);
  const items: TimelineItem[] = toTimelineItems(view0.bookings, view0.lessons);

  return (
    <BayTimeline
      slots={slots}
      step={step}
      bays={bays}
      items={items}
      nowMin={isToday ? jstNowMin() : null}
      itemHref={itemHref}
      selectedId={selectedId}
    />
  );
}
