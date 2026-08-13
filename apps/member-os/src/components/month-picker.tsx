import Link from "next/link";
import {
  monthGrid,
  monthOf,
  addMonths,
  dowOf,
  DOW_JA,
  TIMELINE_KINDS,
  TIMELINE_TONE,
  EMPTY_DAY_COUNT,
  type DayCount,
} from "@/lib/bay-timeline-pure";

/**
 * カレンダー左サイド（#135）
 *
 * Smart Hello（GOLF WINGの現行システム）と同じ並び:
 *   月のミニカレンダー → 月/週/日 の切替 → 表示時刻（粒度） → 表示方法
 * ユーザーが実物の画面を見せて「予約もこのようにカレンダー表示にしてほしい」と指示（2026-08-13）。
 *
 * サーバーコンポーネントのまま作る（JS不要）。日付は全部リンク、粒度だけGETフォーム。
 */

export type CalendarView = "day" | "week" | "month";

export type CalendarHref = (p: { date?: string; view?: CalendarView; month?: string; step?: number }) => string;

/** 表示粒度の選択肢。既定は予約設定の slot_minutes（30分） */
export const STEP_OPTIONS = [15, 30, 60];

function dayTone(c: DayCount): string {
  // その日で一番多い種別の色を薄く敷く（一目で「体験が多い日」が分かるように）
  const top = TIMELINE_KINDS.map((k) => ({ k, n: c[k] })).sort((a, b) => b.n - a.n)[0];
  return top && top.n > 0 ? TIMELINE_TONE[top.k].dot : "";
}

// ------------------------------------------------------------------
// 月のミニカレンダー
// ------------------------------------------------------------------

export function MonthMiniCalendar({
  month,
  selected,
  today,
  href,
  view,
  counts,
  isClosed,
}: {
  month: string;
  selected: string;
  today: string;
  href: CalendarHref;
  view: CalendarView;
  counts?: Map<string, DayCount>;
  isClosed?: (date: string) => boolean;
}) {
  const weeks = monthGrid(month);
  const [y, m] = month.split("-");
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-2">
      <div className="mb-1 flex items-center justify-between">
        <Link
          href={href({ month: addMonths(month, -1), date: `${addMonths(month, -1)}-01`, view })}
          className="rounded px-2 py-1 text-sm text-(--color-dim) hover:text-(--color-txt)"
          aria-label="前の月"
        >
          ←
        </Link>
        <span className="text-sm font-bold tabular-nums">
          {y}年{Number(m)}月
        </span>
        <Link
          href={href({ month: addMonths(month, 1), date: `${addMonths(month, 1)}-01`, view })}
          className="rounded px-2 py-1 text-sm text-(--color-dim) hover:text-(--color-txt)"
          aria-label="次の月"
        >
          →
        </Link>
      </div>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {DOW_JA.map((d, i) => (
              <th
                key={d}
                className={`pb-1 text-[10px] font-medium ${i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-(--color-dim)"}`}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((d) => {
                const inMonth = monthOf(d) === month;
                const c = counts?.get(d) ?? EMPTY_DAY_COUNT;
                const closed = isClosed?.(d) ?? false;
                const sel = d === selected;
                // 月表示のときに日付を押したら日表示へ（月表示のままだと押しても何も変わらないため）
                const to = href({ date: d, month: monthOf(d), view: view === "month" ? "day" : view });
                return (
                  <td key={d} className="p-px text-center">
                    <Link
                      href={to}
                      className={`relative flex h-8 flex-col items-center justify-center rounded-md text-[11px] tabular-nums transition-colors ${
                        sel
                          ? "bg-accent font-bold text-white"
                          : d === today
                            ? "bg-accent/10 font-bold text-accent"
                            : inMonth
                              ? closed
                                ? "text-(--color-dim) opacity-60 hover:bg-(--color-panel-2)"
                                : "text-(--color-txt) hover:bg-(--color-panel-2)"
                              : "text-(--color-dim) opacity-40 hover:bg-(--color-panel-2)"
                      }`}
                      title={closed ? "定休日" : c.total > 0 ? `${c.total}件` : ""}
                    >
                      <span>{Number(d.slice(8))}</span>
                      {c.total > 0 && (
                        <i className={`absolute bottom-0.5 h-1 w-1 rounded-full ${sel ? "bg-white" : dayTone(c)}`} />
                      )}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------
// 月 / 週 / 日 の切替＋表示粒度
// ------------------------------------------------------------------

export function CalendarViewSwitch({
  view,
  step,
  date,
  href,
  hidden = [],
}: {
  view: CalendarView;
  step: number;
  date: string;
  href: CalendarHref;
  /** GETフォームで維持したい追加のクエリ（オーナーの ?store=frank など） */
  hidden?: { name: string; value: string }[];
}) {
  const cls = (active: boolean) =>
    `flex-1 rounded-lg px-2 py-1.5 text-center text-sm transition-colors ${
      active ? "bg-accent font-semibold text-white" : "text-(--color-dim) hover:bg-(--color-panel-2)"
    }`;
  return (
    <div className="space-y-2 rounded-xl border border-(--color-line) bg-(--color-panel) p-2">
      <div className="flex gap-1 rounded-lg bg-(--color-panel-2) p-1">
        <Link href={href({ view: "month" })} className={cls(view === "month")}>月</Link>
        <Link href={href({ view: "week" })} className={cls(view === "week")}>週</Link>
        <Link href={href({ view: "day" })} className={cls(view === "day")}>日</Link>
      </div>

      {/* 表示時刻（縦軸の刻み）。日/週だけで効く */}
      <form className="flex items-center gap-1.5">
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="view" value={view} />
        {hidden.map((h) => (
          <input key={h.name} type="hidden" name={h.name} value={h.value} />
        ))}
        <label className="shrink-0 text-[11px] text-(--color-dim)">表示時刻</label>
        <select
          name="step"
          defaultValue={String(step)}
          className="min-w-0 flex-1 rounded-lg border border-(--color-line) bg-white px-2 py-1 text-xs"
        >
          {STEP_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}分</option>
          ))}
        </select>
        <button className="shrink-0 rounded-lg border border-(--color-line) bg-white px-2 py-1 text-xs text-(--color-dim) hover:text-(--color-txt)">
          表示
        </button>
      </form>

      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[11px] text-(--color-dim)">表示方法</span>
        <span className="flex-1 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-2 py-1 text-xs text-(--color-txt)">
          {view === "day" ? "打席ごと" : view === "week" ? "曜日ごと" : "日ごと"}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// 月表示（本体）
// ------------------------------------------------------------------

/**
 * 月表示は「その日に何件あるか」が分かれば十分（時間軸は持たない）。
 * 1か月ぶんの打席×時間を描いても字が小さすぎて読めないし、
 * 35日 × 3クエリ = 100回超のDBアクセスになるため（件数は1クエリで取る）。
 */
export function MonthCalendar({
  month,
  today,
  counts,
  href,
  isClosed,
}: {
  month: string;
  today: string;
  counts: Map<string, DayCount>;
  href: CalendarHref;
  isClosed?: (date: string) => boolean;
}) {
  const weeks = monthGrid(month);
  return (
    <div className="overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {DOW_JA.map((d, i) => (
              <th
                key={d}
                className={`border-b border-(--color-line) bg-(--color-panel-2) py-1.5 text-xs font-semibold ${
                  i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : "text-(--color-dim)"
                }`}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((d) => {
                const inMonth = monthOf(d) === month;
                const c = counts.get(d) ?? EMPTY_DAY_COUNT;
                const closed = isClosed?.(d) ?? false;
                const dow = dowOf(d);
                return (
                  <td key={d} className="h-20 border-t border-r border-(--color-line) align-top">
                    <Link
                      href={href({ date: d, view: "day", month: monthOf(d) })}
                      className={`flex h-full flex-col gap-0.5 p-1 transition-colors hover:bg-(--color-panel-2) ${
                        inMonth ? "" : "opacity-40"
                      } ${d === today ? "bg-accent/5" : ""}`}
                    >
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          d === today
                            ? "text-accent"
                            : dow === 0
                              ? "text-rose-500"
                              : dow === 6
                                ? "text-sky-500"
                                : "text-(--color-txt)"
                        }`}
                      >
                        {Number(d.slice(8))}
                        {closed && <span className="ml-1 text-[10px] font-normal text-(--color-dim)">定休</span>}
                      </span>
                      {c.total > 0 && (
                        <span className="flex flex-wrap gap-0.5">
                          {TIMELINE_KINDS.filter((k) => c[k] > 0).map((k) => (
                            <span
                              key={k}
                              className={`rounded px-1 text-[10px] leading-4 font-semibold ${TIMELINE_TONE[k].block}`}
                            >
                              {TIMELINE_TONE[k].short}
                              {c[k]}
                            </span>
                          ))}
                        </span>
                      )}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
