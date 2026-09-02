import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank, canAccessGolfWing } from "@/lib/store-scope";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import {
  loadDay,
  loadUnpaid,
  loadMonthCounts,
  loadCoaches,
  loadMemberOptions,
  loadBookingDetail,
  loadLessonDetail,
  loadLiveSignature,
  type BookingRow,
} from "@/lib/frank-reservation";
import {
  BOOKING_STATUS_LABEL,
  CUSTOMER_KIND_LABEL,
  PAYMENT_STATUS_LABEL,
  PAY_METHODS,
  businessHours,
  genSlots,
  jstToday,
  outstanding,
} from "@yozan/core/frank-booking";
import {
  toTimelineItems,
  monthOf,
  labelJa,
  addDaysStr,
  addMonths,
  weekStart,
  toMin,
  type TimelineItem,
} from "@/lib/bay-timeline-pure";
import { BayTimeline, WeekTimeline, TimelineLegend, type WeekDay } from "@/components/bay-timeline";
import {
  MonthMiniCalendar,
  MonthCalendar,
  CalendarViewSwitch,
  STEP_OPTIONS,
  type CalendarView,
} from "@/components/month-picker";
import { BookingDetailPanel, LessonDetailPanel } from "@/components/booking-detail";
import { setBookingStatus, deleteBooking, recordPayment, updateBooking, setLessonOption } from "./actions";
import { BookingSheet } from "./booking-sheet";
import { LiveRefresh } from "@/components/live-refresh";

const LESSON_OS_URL = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";

/** 体験の枠（毎時00分・60分押さえ）。正典は Genesis 側 frank-trial.ts。ここは入力欄の選択肢を作るだけ */
const TRIAL_MINUTES = 60;
const TRIAL_START_STEP = 60;

export const dynamic = "force-dynamic";

/** "10:00:00" と "11:30:00" → 90（所要分） */
function durMin(start: string, end: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.max(15, m(end) - m(start));
}

/**
 * FRANK GOLF 予約管理（スタッフ）— 台帳は frunk_bookings 一本（#93）
 * 会員のWeb予約・体験・レッスン枠・電話予約が、すべてこの1つのグリッドに出る。
 */

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}
function payTone(status: string): "default" | "ok" | "warn" | "danger" | "accent" {
  return status === "paid" ? "ok" : status === "partial" ? "warn" : status === "waived" ? "default" : "danger";
}
function kindTone(kind: string): "accent" | "gold" | "ok" {
  return kind === "member" ? "accent" : kind === "trial" ? "gold" : "ok";
}
/** 予約の相手を1行で（会員／体験／都度で参照先が違う） */
function who(b: BookingRow): string {
  if (b.frunk_members) return `${b.frunk_members.name}（${b.frunk_members.member_no}）`;
  if (b.mbr_trial_requests) return b.mbr_trial_requests.name;
  return b.guest_name ?? "（名称未入力）";
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; step?: string; sel?: string; store?: string }>;
}) {
  const actor = await requireReceptionActor();
  // 店舗またぎ廃止（#134）: FRANK姫路に配属されていない人には存在ごと見せない
  if (!canAccessFrank(actor)) notFound();
  const sp = await searchParams;
  const today = jstToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : today;
  // 月/週/日（#135）。既定は日。表示時刻の刻みは 15/30/60 分だけ許す（既定30分＝予約の刻みと同じ）
  const mode: CalendarView = sp.view === "week" ? "week" : sp.view === "month" ? "month" : "day";
  const step = STEP_OPTIONS.includes(Number(sp.step)) ? Number(sp.step) : 30;
  const month = monthOf(date);
  const weekFrom = weekStart(date); // 週は日曜はじまり（Smart Helloと同じ）
  const days = mode === "week" ? Array.from({ length: 7 }, (_, i) => addDaysStr(weekFrom, i)) : [date];

  const [dayViews, monthData, unpaidRows, coaches, memberOptions, detail, canGw, liveSig] = await Promise.all([
    Promise.all(days.map((d) => loadDay(d, actor.companyId))),
    loadMonthCounts(month, actor.companyId),
    loadUnpaid(actor.companyId),
    loadCoaches(actor.companyId),
    loadMemberOptions(actor.companyId), // 予約作成の会員検索（氏名でも引ける・#189）
    loadSelection(sp.sel ?? null, actor.companyId),
    canAccessGolfWing(actor),
    loadLiveSignature(actor.companyId), // 自動更新の判定（#197）
  ]);

  const dayView = dayViews.find((v) => v.date === date) ?? dayViews[0];
  const { cfg, counts } = monthData;
  const isClosed = (d: string) => businessHours(d, cfg) === null;

  const bays = dayView.bays.filter((b) => b.active);
  const closedBays = dayView.bays.filter((b) => !b.active);
  const live = dayView.bookings.filter((b) => b.status !== "cancelled");

  // 縦＝時間・横＝打席のタイムライン（#135）
  const gridSlots = dayView.hours ? genSlots(dayView.hours, step) : [];
  const items = toTimelineItems(dayView.bookings, dayView.lessons);
  const bookableSlots = new Set(dayView.slots); // 予約を作れる開始時刻（表示粒度とは別）

  // 体験を入れられる開始時刻（毎時00分・約55分＝60分押さえ）。空きの有無はGenesis側が最終判定する
  const trialSlots: string[] = [];
  if (dayView.hours) {
    const open = toMin(dayView.hours.open);
    const close = toMin(dayView.hours.close);
    for (let m = Math.ceil(open / TRIAL_START_STEP) * TRIAL_START_STEP; m + TRIAL_MINUTES <= close; m += TRIAL_START_STEP) {
      trialSlots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:00`);
    }
  }

  const href = (p: { date?: string; view?: CalendarView; month?: string; step?: number; sel?: string }) => {
    const d = p.date ?? date;
    const v = p.view ?? mode;
    const st = p.step ?? step;
    const base = `/reservations?date=${d}&view=${v}&step=${st}`;
    return p.sel ? `${base}&sel=${encodeURIComponent(p.sel)}#booking-detail` : base;
  };
  const itemHref = (item: TimelineItem, d?: string) => href({ date: d ?? date, sel: item.id });

  // 「前へ/次へ」の刻みは表示中の単位に合わせる（日=1日・週=7日・月=1か月）
  const prevHref =
    mode === "month"
      ? href({ date: `${addMonths(month, -1)}-01`, month: addMonths(month, -1) })
      : href({ date: addDaysStr(date, mode === "week" ? -7 : -1) });
  const nextHref =
    mode === "month"
      ? href({ date: `${addMonths(month, 1)}-01`, month: addMonths(month, 1) })
      : href({ date: addDaysStr(date, mode === "week" ? 7 : 1) });

  const unpaidList = unpaidRows
    .map((b) => ({ b, out: outstanding(b.amount, b.paid_amount, b.payment_status) }))
    .filter((x) => x.out > 0);
  const unpaidTotal = unpaidList.reduce((s, x) => s + x.out, 0);

  const trialCount = live.filter((b) => b.customer_kind === "trial").length;
  // パーソナルレッスン25分の「希望（未確定）」。担当を決めるまで放置されないよう件数を出す（0136）
  const lessonWaiting = live.filter((b) => b.lesson_option_status === "requested");

  const calendar =
    mode === "month" ? (
      <MonthCalendar month={month} today={today} counts={counts} href={href} isClosed={isClosed} />
    ) : mode === "week" ? (
      <WeekTimeline
        days={dayViews.map(toWeekDay)}
        step={step}
        bayCount={bays.length}
        hrefDay={(d) => href({ date: d, view: "day", month: monthOf(d) })}
        today={today}
        itemHref={itemHref}
      />
    ) : dayView.closed || !dayView.hours ? (
      <Empty>{labelJa(date)} は定休日です（営業時間・定休日は Genesis の /site-admin で変更できます）</Empty>
    ) : (
      // 空きマスを押すと、その日・その時刻・その打席で入力パネルが開く（#192）
      <BookingSheet
        date={date}
        dateLabel={labelJa(date)}
        bays={bays.map((b) => ({ id: b.id, name: b.name }))}
        slots={dayView.slots}
        minutesOptions={cfg.max_minutes_options}
        members={memberOptions}
        trialSlots={trialSlots}
      >
        <BayTimeline
          slots={gridSlots}
          step={step}
          bays={bays}
          items={items}
          nowMin={date === today ? jstNowMin() : null}
          emptyTap={(_bayId, slot) => bookableSlots.has(slot)}
          itemHref={(it) => itemHref(it)}
          selectedId={sp.sel ?? null}
          maxHeightClass="max-h-[68vh]"
        />
      </BookingSheet>
    );

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">予約 — FRANK GOLF 姫路</h1>
          <p className="mt-0.5 text-sm text-(--color-dim)">
            体験・会員・都度・レッスンの予約をこの1画面で。空いているマスを押すとその場で登録できます
          </p>
          {/* お客様の予約は24時間いつでも入る。リロード待ちにすると見落とすので自動で取り直す（#197） */}
          <div className="mt-1.5">
            <LiveRefresh signature={liveSig} intervalSec={15} label="予約に動きがありました" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={prevHref} className={btnGhostCls} aria-label="前へ">←</Link>
          <form className="flex items-center gap-2">
            <input type="hidden" name="view" value={mode} />
            <input type="hidden" name="step" value={String(step)} />
            <input type="date" name="date" defaultValue={date} className={inputCls} />
            <button className={btnGhostCls}>表示</button>
          </form>
          <Link href={nextHref} className={btnGhostCls} aria-label="次へ">→</Link>
          <Link href={href({ date: today, month: monthOf(today) })} className={btnGhostCls}>今日</Link>
        </div>
      </header>

      {canGw && (
        <p className="text-right text-xs">
          <Link href="/dashboard?store=gw" className="text-(--color-dim) underline hover:text-(--color-txt)">
            GOLF WING 宝塚の月次サマリーを見る →
          </Link>
        </p>
      )}

      <Panel
        title={`予約カレンダー　${
          mode === "month"
            ? `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`
            : mode === "week"
              ? `${labelJa(weekFrom)} 〜 ${labelJa(addDaysStr(weekFrom, 6))}`
              : `${labelJa(date)}${dayView.closed ? "　定休日" : `　${dayView.hours?.open}〜${dayView.hours?.close}`}`
        }`}
        className="d1"
      >
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* 左サイド: 月ミニカレンダー → 月/週/日 → 表示時刻（Smart Helloと同じ並び） */}
          <aside className="w-full shrink-0 space-y-3 lg:w-56">
            <MonthMiniCalendar
              month={month}
              selected={date}
              today={today}
              href={href}
              view={mode}
              counts={counts}
              isClosed={isClosed}
            />
            <CalendarViewSwitch view={mode} step={step} date={date} href={href} />
            <div className="flex flex-col gap-1.5 text-xs">
              <a href={`${LESSON_OS_URL}/frank`} target="_blank" rel="noreferrer" className={btnGhostCls}>🎯 レッスン管理システム ↗</a>
              <Link href="/frunk" className={btnGhostCls}>FRANK会員（重要説明事項の記入）</Link>
              <Link href="/board" target="_blank" className={btnGhostCls}>ロビー掲示用カレンダー ↗</Link>
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-3">
            {detail && (
              <div id="booking-detail">
                {detail.kind === "booking" ? (
                  <BookingDetailPanel
                    b={detail.booking}
                    backHref={href({})}
                    date={detail.booking.booked_date}
                    bays={bays.map((x) => ({ id: x.id, name: x.name }))}
                  />
                ) : (
                  <LessonDetailPanel l={detail.lesson} backHref={href({})} />
                )}
              </div>
            )}

            {calendar}

            <TimelineLegend>
              <span>空いているマスを押すと、その時間で【体験】【会員・都度】を登録できます</span>
              <span>予約の名前を押すと詳細（連絡先・会計・来店処理）が開きます</span>
              <span>⚠ = 重要説明事項あり（FRANK会員画面で記入・確認）</span>
              {closedBays.length > 0 && <span>休止中: {closedBays.map((b) => b.name).join("・")}</span>}
            </TimelineLegend>
          </div>
        </div>
      </Panel>

      <Panel title="お客様ご自身のご予約について" className="d1">
        <p className="text-sm text-(--color-dim)">
          お客様のご予約は <strong className="text-(--color-txt)">公式サイト（frankgolf.jp）</strong> と
          <strong className="text-(--color-txt)"> 会員ポータル（my.frankgolf.jp）</strong> で完結し、この画面にすぐ表示されます。
          電話・店頭で受けたぶんだけ、カレンダーのマスを押して登録してください。
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <a href="https://frankgolf.jp/trial-booking.html" target="_blank" rel="noreferrer" className={btnGhostCls}>体験予約ページ ↗</a>
          <a href="https://my.frankgolf.jp/member/login" target="_blank" rel="noreferrer" className={btnGhostCls}>会員ポータル ↗</a>
        </div>
      </Panel>

      {lessonWaiting.length > 0 && (
        <Panel title={`パーソナルレッスン（25分）のご希望　${lessonWaiting.length}件 未確定`} className="d1">
          <p className="text-sm text-(--color-dim)">
            会員様が打席予約に追加されたご希望です。<strong className="text-(--color-txt)">担当プロと開始時刻</strong>を決めて、
            下の予約一覧から「確定」してください（お受けできない場合は「お断り」にして、お客様へご連絡をお願いします）。
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {lessonWaiting.map((b) => (
              <li key={b.id}>
                <a href={`#bk-${b.id}`} className="text-indigo-600 underline">
                  {b.start_time.slice(0, 5)}〜{b.end_time.slice(0, 5)}　{who(b)}（{b.frunk_bays?.name ?? ""}）
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* 未収金サマリ */}
      <Panel title={`未収金サマリ（未収・一部入金 ${unpaidList.length}件）`} className="d2">
        {unpaidList.length === 0 ? (
          <Empty>未収金はありません</Empty>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-sm text-(--color-dim)">未収合計</span>
              <span className="text-2xl font-bold tabular-nums text-rose-600">{yen(unpaidTotal)}</span>
            </div>
            <div className="space-y-1.5">
              {unpaidList.map(({ b, out }) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={payTone(b.payment_status)}>{PAYMENT_STATUS_LABEL[b.payment_status]}</Badge>
                    <span className="font-semibold">{who(b)}</span>
                    <span className="text-xs text-(--color-dim)">
                      {[b.booked_date, b.start_time.slice(0, 5), b.frunk_bays?.name].filter(Boolean).join("　")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-(--color-dim)">請求 {yen(Number(b.amount))}／入金 {yen(b.paid_amount)}</span>
                    <span className="font-semibold tabular-nums text-rose-600">未収 {yen(out)}</span>
                    <form action={recordPayment}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="date" value={date} />
                      <input type="hidden" name="amount" value={String(b.amount)} />
                      <button name="mode" value="full" className={btnGhostCls}>全額入金</button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      {/* 当日の予約一覧 */}
      <Panel title={`予約一覧（${date}）　${live.length}件${trialCount ? `（うち体験 ${trialCount}件）` : ""}`} className="d3">
        {dayView.bookings.length === 0 ? (
          <Empty>この日の予約はありません</Empty>
        ) : (
          <div className="space-y-2">
            {dayView.bookings.map((b) => {
              const out = outstanding(b.amount, b.paid_amount, b.payment_status);
              const t = b.mbr_trial_requests;
              return (
                <div id={`bk-${b.id}`} key={b.id} className="space-y-2 scroll-mt-24 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={b.status === "cancelled" ? "default" : b.status === "visited" ? "ok" : b.status === "no_show" ? "danger" : kindTone(b.customer_kind)}>
                        {b.status === "confirmed" ? CUSTOMER_KIND_LABEL[b.customer_kind] : BOOKING_STATUS_LABEL[b.status]}
                      </Badge>
                      <span className="font-semibold tabular-nums">{b.start_time.slice(0, 5)}〜{b.end_time.slice(0, 5)}</span>
                      {b.frunk_members && b.member_id ? (
                        <a href={`/frunk/${b.member_id}`} className="font-semibold text-indigo-600 underline">
                          {who(b)}
                        </a>
                      ) : (
                        <span className="font-semibold">{who(b)}</span>
                      )}
                      {t?.lefty ? <Badge tone="warn">レフティ</Badge> : null}
                      {b.lesson_option_status === "requested" ? <Badge tone="warn">パーソナル{b.lesson_option_minutes ?? 25}分 希望</Badge> : null}
                      {b.lesson_option_status === "confirmed" ? (
                        <Badge tone="ok">
                          パーソナル{b.lesson_option_minutes ?? 25}分
                          {b.lesson_option_start ? ` ${b.lesson_option_start.slice(0, 5)}〜` : ""}
                        </Badge>
                      ) : null}
                      {b.lesson_option_status === "declined" ? <Badge tone="default">パーソナル お断り</Badge> : null}
                      <span className="text-xs text-(--color-dim)">
                        {[b.frunk_bays?.name, b.guest_phone ?? t?.phone, t?.experience, b.party_size && b.party_size > 1 ? `${b.party_size}名` : null]
                          .filter(Boolean).join("　")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.status !== "visited" && (
                        <form action={setBookingStatus}>
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <input type="hidden" name="status" value="visited" /><button className={btnGhostCls}>来店</button>
                        </form>
                      )}
                      {b.status !== "no_show" && (
                        <form action={setBookingStatus}>
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <input type="hidden" name="status" value="no_show" /><button className={btnGhostCls}>無断欠</button>
                        </form>
                      )}
                      {b.status !== "cancelled" && (
                        <form action={setBookingStatus}>
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <input type="hidden" name="status" value="cancelled" /><button className={btnGhostCls}>取消</button>
                        </form>
                      )}
                      <form action={deleteBooking}>
                        <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                        <button className="text-xs text-(--color-dim) hover:text-red-400">削除</button>
                      </form>
                    </div>
                  </div>

                  {t?.message ? (
                    <p className="text-xs text-(--color-dim)">ご要望: {t.message}</p>
                  ) : null}

                  {/* パーソナルレッスン25分（0136）。打席のお時間の中で、誰が・何時から教えるかを決めて確定する */}
                  {b.lesson_option_status ? (
                    <details
                      className="rounded-lg border border-(--color-line) bg-white/60 px-2 py-1.5"
                      open={b.lesson_option_status === "requested"}
                    >
                      <summary className="cursor-pointer text-xs font-semibold text-(--color-dim)">
                        パーソナルレッスン（{b.lesson_option_minutes ?? 25}分・{yen(b.lesson_option_fee ?? 2500)}）
                        {b.lesson_option_status === "requested" ? " — 担当と時間を決めて確定" : " — 内容を変更"}
                      </summary>
                      {b.lesson_option_note ? (
                        <p className="mt-2 text-xs text-(--color-dim)">会員様のご要望: {b.lesson_option_note}</p>
                      ) : null}
                      <form action={setLessonOption} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="date" value={date} />
                        <input type="hidden" name="mode" value="confirm" />
                        <Field label="担当プロ">
                          <select name="staff_id" defaultValue={b.lesson_option_staff_id ?? ""} className={inputCls}>
                            <option value="">選択してください</option>
                            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </Field>
                        <Field label={`開始（${b.start_time.slice(0, 5)}〜${b.end_time.slice(0, 5)} の中で）`}>
                          <input
                            type="time"
                            name="lesson_start"
                            defaultValue={(b.lesson_option_start ?? b.start_time).slice(0, 5)}
                            step={300}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="所要（分）">
                          <input name="lesson_minutes" inputMode="numeric" defaultValue={String(b.lesson_option_minutes ?? 25)} className={inputCls} />
                        </Field>
                        <div className="flex items-end gap-2">
                          <button className={btnCls}>確定</button>
                        </div>
                      </form>
                      <div className="mt-2 flex gap-3">
                        <form action={setLessonOption}>
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <input type="hidden" name="mode" value="decline" />
                          <button className="text-xs text-(--color-dim) underline hover:text-red-400">お断り（要ご連絡）</button>
                        </form>
                        <form action={setLessonOption}>
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <input type="hidden" name="mode" value="clear" />
                          <button className="text-xs text-(--color-dim) underline">この希望を取り消す</button>
                        </form>
                      </div>
                    </details>
                  ) : null}

                  {/* 日時・打席の変更（#151）。消して作り直さずに直せる */}
                  <details className="rounded-lg border border-(--color-line) bg-white/60 px-2 py-1.5">
                    <summary className="cursor-pointer text-xs font-semibold text-(--color-dim)">日時・打席を変更</summary>
                    <form action={updateBooking} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="date" value={date} />
                      <Field label="日付">
                        <input type="date" name="booking_date" defaultValue={b.booked_date} className={inputCls} />
                      </Field>
                      <Field label="開始">
                        <input type="time" name="start_time" defaultValue={b.start_time.slice(0, 5)} step={900} className={inputCls} />
                      </Field>
                      <Field label="所要（分）">
                        <input name="minutes" inputMode="numeric" defaultValue={String(durMin(b.start_time, b.end_time))} className={inputCls} />
                      </Field>
                      <Field label="打席">
                        <select name="bay_id" defaultValue={b.bay_id ?? ""} className={inputCls}>
                          {bays.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </Field>
                      {!b.frunk_members ? (
                        <>
                          <Field label="お名前">
                            <input name="guest_name" defaultValue={b.guest_name ?? ""} className={inputCls} />
                          </Field>
                          <Field label="電話">
                            <input name="guest_phone" defaultValue={b.guest_phone ?? ""} className={inputCls} />
                          </Field>
                        </>
                      ) : null}
                      <Field label="人数">
                        <input name="party_size" inputMode="numeric" defaultValue={String(b.party_size ?? 1)} className={inputCls} />
                      </Field>
                      <Field label="備考">
                        <input name="note" defaultValue={b.note ?? ""} className={inputCls} />
                      </Field>
                      <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-4">
                        <label className="flex items-center gap-1.5 text-xs text-(--color-dim)">
                          <input type="checkbox" name="notify" value="1" />
                          お客様にメールで知らせる
                        </label>
                        <button className={btnCls}>変更を保存</button>
                        <span className="text-[11px] text-(--color-dim)">
                          定休日・営業時間外、ほかの予約やレッスン枠と重なる時間には動かせません
                          {t ? "／体験は申込と受付台帳の日付も一緒に直ります" : ""}
                        </span>
                      </div>
                    </form>
                  </details>

                  <form action={recordPayment} className="flex flex-wrap items-center gap-2 border-t border-(--color-line) pt-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="date" value={date} />
                    <Badge tone={payTone(b.payment_status)}>{PAYMENT_STATUS_LABEL[b.payment_status]}</Badge>
                    <label className="flex items-center gap-1 text-xs text-(--color-dim)">請求
                      <input name="amount" inputMode="numeric" defaultValue={b.amount != null ? String(b.amount) : ""} className={`${inputCls} !w-24 !py-1`} />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-(--color-dim)">入金
                      <input name="paid_amount" inputMode="numeric" defaultValue={String(b.paid_amount)} className={`${inputCls} !w-24 !py-1`} />
                    </label>
                    <select name="payment_method" defaultValue={b.payment_method ?? ""} className={`${inputCls} !w-28 !py-1`}>
                      <option value="">方法</option>
                      {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    {out > 0 && <span className="text-xs font-semibold text-rose-600">未収 {yen(out)}</span>}
                    <button name="mode" value="partial" className={btnGhostCls}>記録</button>
                    <button name="mode" value="full" className={btnCls}>全額入金</button>
                    <button name="mode" value="waive" className="text-xs text-(--color-dim) hover:text-(--color-txt)">免除</button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="店頭カレンダー（ロビー掲示）" className="d3">
        <p className="mb-3 text-xs text-(--color-dim)">
          ロビーの常設タブレットに映す当日カレンダーです。店舗アカウントでログインしたまま開いてください
          （60秒ごとに自動更新・お名前は名字のみ表示）。URLの発行は不要になりました。
        </p>
        <a href="/board" target="_blank" rel="noreferrer" className={btnGhostCls}>店頭カレンダーを開く ↗</a>
      </Panel>
    </div>
  );
}


function toWeekDay(v: Awaited<ReturnType<typeof loadDay>>): WeekDay {
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

/** ?sel= の中身を詳細データに変える。`lesson:<uuid>` はレッスン枠、それ以外は予約ID（#139） */
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
