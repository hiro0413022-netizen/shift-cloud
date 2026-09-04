import type { ReactNode } from "react";
import Link from "next/link";
import {
  buildTimeline,
  groupBySlot,
  unionSlots,
  timeRange,
  labelJa,
  TIMELINE_KINDS,
  TIMELINE_TONE,
  LESSON_OPT_EDGE,
  lessonBadge,
  toMin,
  type TimelineItem,
  type UnplacedReason,
} from "@/lib/bay-timeline-pure";

/**
 * FRANK GOLF 予約タイムライン（#135）
 *
 * ★ 縦＝時間（上から下へ）・横＝打席。Smart Hello（GOLF WINGの現行システム）と同じ向き。
 *   ユーザー指示（2026-08-13）で転置した。以前は横が時間だったため、
 *   「1日ぶんを縦にスクロールして読む」という店頭の使い方に合っていなかった。
 *
 * ★ iPad横向き（店頭タブレット）前提
 *   - 時間の列は sticky left-0、打席のヘッダは sticky top-0。
 *   - 打席が増えても横スクロールで耐える（打席列は固定幅）。
 *
 * ★ 色は @/lib/bay-timeline-pure の TIMELINE_TONE だけを使う。ここで直書きしないこと。
 */

/** 1コマの高さ。30分刻みでiPadでもタップしやすい高さ（rowSpanでn倍になる） */
const ROW_H = "h-12";

export type TimelineBay = {
  id: string;
  name: string;
  floor?: number;
  equipment?: string | null;
  is_lefty?: boolean;
};

function BlockBody({ item, span }: { item: TimelineItem; span: number }) {
  return (
    <>
      <span className="block truncate text-[10px] font-semibold tabular-nums opacity-80">{timeRange(item)}</span>
      <span className="block truncate text-xs font-bold leading-tight">
        {item.alert ? <span title={item.alertNote}>⚠</span> : null}
        {item.title}
      </span>
      {/* レッスン付きはここで見分ける（#214）。チケットは🎫、担当が決まっていれば名前まで */}
      {item.lessonOpt ? (
        <span
          className={`block truncate text-[10px] font-bold leading-tight ${
            item.lessonOpt === "requested" ? "text-amber-700" : "text-violet-700"
          }`}
        >
          {lessonBadge(item)}
        </span>
      ) : null}
      {span >= 2 && item.sub ? (
        <span className="block truncate text-[10px] leading-tight opacity-70">{item.sub}</span>
      ) : null}
    </>
  );
}

export function BayTimeline({
  slots,
  step,
  bays,
  items,
  nowMin = null,
  emptyHref,
  emptyTap,
  itemHref,
  selectedId = null,
  maxHeightClass = "max-h-[72vh]",
}: {
  slots: string[];
  step: number;
  bays: TimelineBay[];
  items: TimelineItem[];
  /** 今日のときだけ現在時刻（JSTの分）。現在のコマに印を出す */
  nowMin?: number | null;
  /** 空きコマを押したときの遷移先（/reservations で予約作成フォームに流し込む）。
   *  undefined を返すとただの空き枠として描く（例: 15分表示中の10:15は予約の刻みに乗らない） */
  emptyHref?: (bayId: string, slot: string) => string | undefined;
  /** 空きコマを「その場の入力パネル」で開く（#192）。true を返したコマだけ押せるボタンになる。
   *  実際に開くのは親の <BookingSheet>（data-book-* を拾うクライアント側）。emptyHref より優先。 */
  emptyTap?: (bayId: string, slot: string) => boolean;
  /** 予約ブロックを押したときの遷移先（詳細を開く・#139）。undefined を返すと押せないまま */
  itemHref?: (item: TimelineItem) => string | undefined;
  /** いま詳細を開いている予約（枠を太くして「これを見ている」と分かるようにする） */
  selectedId?: string | null;
  maxHeightClass?: string;
}) {
  const layout = buildTimeline(slots, step, bays.map((b) => b.id), items);

  return (
    <div className="space-y-2">
      <div className={`overflow-auto rounded-xl border border-(--color-line) ${maxHeightClass}`}>
        <table className="w-full border-separate border-spacing-0 bg-(--color-panel)">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 w-16 min-w-16 border-r border-b border-(--color-line) bg-(--color-panel-2) px-1 py-2 text-[10px] font-semibold text-(--color-dim)">
                時間
              </th>
              {bays.map((b) => (
                <th
                  key={b.id}
                  className="sticky top-0 z-20 min-w-32 border-r border-b border-(--color-line) bg-(--color-panel-2) px-2 py-1.5 text-center"
                >
                  <span className="block text-sm font-bold whitespace-nowrap">{b.name}</span>
                  <span className="block text-[10px] font-normal text-(--color-dim) whitespace-nowrap">
                    {[b.floor ? `${b.floor}F` : null, b.equipment, b.is_lefty ? "左右打席" : null]
                      .filter(Boolean)
                      .join("・") || "　"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layout.rows.map((row) => {
              const isNow = nowMin != null && toMin(row.slot) <= nowMin && nowMin < toMin(row.slot) + step;
              // 1時間の区切りだけ線を濃くする（30分刻みだと線だらけで読めないため）
              const hourTop = toMin(row.slot) % 60 === 0;
              return (
                <tr key={row.slot} className={ROW_H}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 border-r border-(--color-line) bg-(--color-panel-2) px-1 text-[11px] font-semibold tabular-nums ${
                      hourTop ? "border-t" : ""
                    } ${isNow ? "text-accent" : "text-(--color-dim)"}`}
                  >
                    {row.slot.slice(0, 5)}
                  </th>
                  {row.cells.map((cell, i) => {
                    if (cell.kind === "covered") return null; // 上のブロックのrowSpanが飲み込んでいる
                    const base = `border-r border-(--color-line) p-0.5 align-top ${hourTop ? "border-t" : ""} ${isNow ? "bg-accent/5" : ""}`;
                    if (cell.kind === "empty") {
                      // 空きコマの見た目は3通り: その場で開くボタン / 別画面へのリンク / ただの空き
                      const emptyCls =
                        "flex h-full min-h-10 w-full items-center justify-center rounded-md border border-dashed border-(--color-line) bg-(--color-panel-2) text-sm text-(--color-dim)/40 transition-colors hover:border-accent hover:bg-accent/5 hover:text-accent";
                      if (emptyTap?.(cell.bayId, cell.slot)) {
                        return (
                          <td key={bays[i].id} className={base}>
                            <button
                              type="button"
                              data-book-bay={cell.bayId}
                              data-book-slot={cell.slot}
                              aria-label={`${cell.slot.slice(0, 5)} ${bays[i].name} に予約を入れる`}
                              className={emptyCls}
                            >
                              ＋
                            </button>
                          </td>
                        );
                      }
                      const href = emptyHref?.(cell.bayId, cell.slot);
                      return (
                        <td key={bays[i].id} className={base}>
                          {href ? (
                            <Link href={href} className={emptyCls}>
                              ＋
                            </Link>
                          ) : (
                            <div className="h-full min-h-10 rounded-md border border-dashed border-(--color-line) bg-(--color-panel-2)" />
                          )}
                        </td>
                      );
                    }
                    const { item, span, cutTop, cutBottom } = cell.block;
                    // 営業時間からはみ出しているブロックは角を落として「まだ続いている」ことを示す
                    const cut = `${cutTop ? "rounded-t-none " : ""}${cutBottom ? "rounded-b-none" : ""}`;
                    const sel = selectedId != null && selectedId === item.id;
                    const cls = `flex h-full flex-col justify-start overflow-hidden rounded-md border px-1.5 py-1 ${TIMELINE_TONE[item.kind].block} ${
                      item.lessonOpt ? LESSON_OPT_EDGE[item.lessonOpt] : ""
                    } ${cut} ${sel ? "ring-2 ring-accent ring-offset-1" : ""}`;
                    const title = `${timeRange(item)} ${item.title}${item.sub ? `（${item.sub}）` : ""}${item.alertNote ? ` ⚠${item.alertNote}` : ""}`;
                    const href = itemHref?.(item);
                    return (
                      <td key={bays[i].id} rowSpan={span} className={base}>
                        {href ? (
                          // 名前を押すと詳細が開く（#139）。店頭PC/タブレットはツールチップが出ないため
                          <Link href={href} scroll={false} className={`${cls} transition-shadow hover:shadow-md`} title={title}>
                            <BlockBody item={item} span={span} />
                          </Link>
                        ) : (
                          <div className={cls} title={title}>
                            <BlockBody item={item} span={span} />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <UnplacedList unplaced={layout.unplaced} itemHref={itemHref} />
    </div>
  );
}

const REASON_LABEL: Record<UnplacedReason, string> = {
  no_bay: "打席の指定なし",
  outside_hours: "営業時間の外",
  conflict: "同じ打席・同じ時間に重なっています",
};

/** 表に置けなかったものは黙って消さない（消すと「予約したのに画面に無い」になる） */
export function UnplacedList({
  unplaced,
  itemHref,
}: {
  unplaced: { item: TimelineItem; reason: UnplacedReason }[];
  itemHref?: (item: TimelineItem) => string | undefined;
}) {
  if (unplaced.length === 0) return null;
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel-2) px-3 py-2">
      <p className="mb-1.5 text-[11px] font-semibold text-(--color-dim)">表に入らなかった予定 {unplaced.length}件</p>
      <div className="flex flex-wrap gap-1.5">
        {unplaced.map(({ item, reason }) => {
          const cls = `inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] ${TIMELINE_TONE[item.kind].block}`;
          const body = (
            <>
              <span className="tabular-nums">{timeRange(item)}</span>
              <span className="font-semibold">{item.title}</span>
              <span className="opacity-70">/ {REASON_LABEL[reason]}</span>
            </>
          );
          const href = itemHref?.(item);
          return href ? (
            <Link key={item.id} href={href} scroll={false} className={cls} title={REASON_LABEL[reason]}>
              {body}
            </Link>
          ) : (
            <span key={item.id} className={cls} title={REASON_LABEL[reason]}>
              {body}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** 凡例（4種の色をここでしか持たない） */
export function TimelineLegend({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-(--color-dim)">
      {TIMELINE_KINDS.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <i className={`inline-block h-3 w-3 rounded ${TIMELINE_TONE[k].dot}`} />
          {TIMELINE_TONE[k].label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <i className="inline-block h-3 w-3 rounded border border-dashed border-(--color-line) bg-(--color-panel-2)" />
        空き
      </span>
      {/* #214: レッスン付きは左端の縦線で分かる */}
      <span className="flex items-center gap-1.5">
        <i className="inline-block h-3 w-3 rounded border-l-4 border-l-violet-600 bg-(--color-panel-2)" />
        レッスン確定（🎫＝チケット）
      </span>
      <span className="flex items-center gap-1.5">
        <i className="inline-block h-3 w-3 rounded border-l-4 border-l-amber-500 bg-(--color-panel-2)" />
        レッスン希望（未確定）
      </span>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------
// 週表示
// ------------------------------------------------------------------

export type WeekDay = {
  date: string;
  closed: boolean;
  slots: string[];
  items: TimelineItem[];
};

/**
 * 週表示：縦＝時間・横＝曜日（7列）。打席は合算する。
 *
 * ★ なぜ「日×打席」にしなかったか
 *   打席3〜4面 × 7日 = 21〜28列になり、iPad横向き(1180px)では1列40pxを切って何も読めない。
 *   週にスタッフが知りたいのは「どの時間帯が埋まっているか／空いているか」なので、
 *   打席は合算して件数と色で密度を見せ、細かい打席割りは日表示で見る、という分担にした。
 *   日付の見出しを押すとその日の日表示（縦＝時間・横＝打席）へ飛ぶ。
 */
export function WeekTimeline({
  days,
  step,
  bayCount,
  hrefDay,
  today,
  itemHref,
}: {
  days: WeekDay[];
  step: number;
  /** 稼働している打席の数。満席かどうかの判定に使う */
  bayCount: number;
  hrefDay: (date: string) => string;
  today: string;
  /** 予約チップを押したときの遷移先（詳細を開く・#139） */
  itemHref?: (item: TimelineItem, date: string) => string | undefined;
}) {
  const slots = unionSlots(days.map((d) => d.slots));
  const columns = days.map((d) => ({
    day: d,
    open: new Set(d.slots.map((s) => s.slice(0, 5))),
    bySlot: groupBySlot(slots, step, d.items),
  }));

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-10 text-center text-sm text-(--color-dim)">
        この週は営業日がありません
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-(--color-line) max-h-[72vh]">
      <table className="w-full border-separate border-spacing-0 bg-(--color-panel)">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-30 w-16 min-w-16 border-r border-b border-(--color-line) bg-(--color-panel-2) px-1 py-2 text-[10px] font-semibold text-(--color-dim)">
              時間
            </th>
            {columns.map(({ day }) => (
              <th
                key={day.date}
                className={`sticky top-0 z-20 min-w-28 border-r border-b border-(--color-line) px-2 py-2 text-center ${
                  day.date === today ? "bg-accent/10" : "bg-(--color-panel-2)"
                }`}
              >
                <Link href={hrefDay(day.date)} className="text-sm font-bold whitespace-nowrap hover:text-accent">
                  {labelJa(day.date)}
                </Link>
                <span className="block text-[10px] font-normal text-(--color-dim)">
                  {day.closed ? "定休日" : `${day.items.length}件`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, r) => {
            const hourTop = toMin(slot) % 60 === 0;
            return (
              <tr key={slot} className="h-10">
                <th
                  scope="row"
                  className={`sticky left-0 z-10 border-r border-(--color-line) bg-(--color-panel-2) px-1 text-[11px] font-semibold tabular-nums text-(--color-dim) ${hourTop ? "border-t" : ""}`}
                >
                  {slot}
                </th>
                {columns.map(({ day, open, bySlot }) => {
                  const cellCls = `border-r border-(--color-line) p-0.5 align-top ${hourTop ? "border-t" : ""}`;
                  if (!open.has(slot)) {
                    // その日の営業時間外（火曜定休・土日は20時まで、など）
                    return <td key={day.date} className={`${cellCls} bg-(--color-panel-2)`} />;
                  }
                  const list = bySlot[r];
                  if (list.length === 0) {
                    // 空きコマを押したらその日の日表示へ（打席まで選んで予約するのは日表示・#192）
                    return (
                      <td key={day.date} className={cellCls}>
                        <Link
                          href={hrefDay(day.date)}
                          className="flex h-full min-h-8 items-center justify-center rounded border border-dashed border-(--color-line) bg-(--color-panel-2) text-[10px] text-(--color-dim)/40 transition-colors hover:border-accent hover:bg-accent/5 hover:text-accent"
                        >
                          ＋
                        </Link>
                      </td>
                    );
                  }
                  const full = bayCount > 0 && list.filter((i) => i.kind !== "lesson").length >= bayCount;
                  return (
                    <td key={day.date} className={cellCls}>
                      <div className="flex h-full min-h-8 flex-col gap-0.5">
                        {list.slice(0, 2).map((it) => {
                          const chip = `truncate rounded border px-1 text-[10px] leading-4 ${TIMELINE_TONE[it.kind].block}`;
                          const href = itemHref?.(it, day.date);
                          return href ? (
                            <Link key={it.id} href={href} scroll={false} className={chip} title={`${timeRange(it)} ${it.title}`}>
                              {it.start.slice(0, 5)} {it.title}
                            </Link>
                          ) : (
                            <span key={it.id} className={`${chip} ${it.lessonOpt ? LESSON_OPT_EDGE[it.lessonOpt] : ""}`} title={`${timeRange(it)} ${it.title}${it.lessonOpt ? ` / ${lessonBadge(it)}` : ""}`}>
                              {it.start.slice(0, 5)} {it.title}
                              {it.lessonOpt ? (it.lessonTicket ? " 🎫" : " ⛳") : ""}
                            </span>
                          );
                        })}
                        {list.length > 2 && (
                          <span className="px-1 text-[10px] leading-4 text-(--color-dim)">他{list.length - 2}件</span>
                        )}
                        {full && <span className="px-1 text-[10px] leading-4 font-semibold text-rose-600">満席</span>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
