import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { loadDay, loadUnpaid, loadMonthCounts, type BookingRow } from "@/lib/frank-reservation";
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
import { toTimelineItems, monthOf, labelJa } from "@/lib/bay-timeline-pure";
import { BayTimeline, TimelineLegend } from "@/components/bay-timeline";
import { MonthMiniCalendar, STEP_OPTIONS } from "@/components/month-picker";
import { createBooking, setBookingStatus, deleteBooking, recordPayment } from "./actions";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ date?: string; step?: string; bay?: string; start?: string }>;
}) {
  const actor = await requireReceptionActor();
  // 店舗またぎ廃止（#134）: FRANK姫路に配属されていない人には存在ごと見せない
  if (!canAccessFrank(actor)) notFound();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : jstToday();
  // 縦軸の刻み（#135）。既定は30分＝予約の刻みと同じ
  const step = STEP_OPTIONS.includes(Number(sp.step)) ? Number(sp.step) : 30;

  const [view, unpaidRows, monthData] = await Promise.all([
    loadDay(date, actor.companyId),
    loadUnpaid(actor.companyId),
    loadMonthCounts(monthOf(date), actor.companyId),
  ]);
  const bays = view.bays.filter((b) => b.active);
  const closedBays = view.bays.filter((b) => !b.active);
  const live = view.bookings.filter((b) => b.status !== "cancelled");

  // 縦＝時間・横＝打席のタイムライン（#135・/dashboard と同じ部品・同じ色）
  const gridSlots = view.hours ? genSlots(view.hours, step) : [];
  const items = toTimelineItems(view.bookings, view.lessons);
  const bookableSlots = new Set(view.slots); // 予約を作れる開始時刻（表示粒度とは別）
  const emptyHref = (bayId: string, slot: string) =>
    bookableSlots.has(slot) ? `/reservations?date=${date}&step=${step}&bay=${bayId}&start=${slot}#booking-form` : undefined;
  // 空きコマを押して来たときは、予約作成フォームに打席と開始時刻を入れておく
  const preBay = bays.some((b) => b.id === sp.bay) ? (sp.bay as string) : (bays[0]?.id ?? "");
  const preStart = view.slots.includes(sp.start ?? "") ? (sp.start as string) : (view.slots[0] ?? "");

  const unpaidList = unpaidRows
    .map((b) => ({ b, out: outstanding(b.amount, b.paid_amount, b.payment_status) }))
    .filter((x) => x.out > 0);
  const unpaidTotal = unpaidList.reduce((s, x) => s + x.out, 0);

  const trialCount = live.filter((b) => b.customer_kind === "trial").length;

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">予約管理 — FRANK GOLF 姫路</h1>
          <p className="text-sm text-(--color-dim)">
            会員のWeb予約・体験・レッスン・電話予約をまとめて管理します（台帳は1つ）
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={date} className={inputCls} />
          <select name="step" defaultValue={String(step)} className={`${inputCls} !w-24`} aria-label="表示時刻">
            {STEP_OPTIONS.map((s) => <option key={s} value={s}>{s}分</option>)}
          </select>
          <button className={btnGhostCls}>表示</button>
        </form>
      </header>

      <Panel title="お客様のご予約について" className="d1">
        <p className="text-sm text-(--color-dim)">
          お客様のご予約は <strong className="text-(--color-txt)">公式サイト（frankgolf.jp）</strong> で完結します。
          体験は日時を選ぶだけでその場で確定し、この画面にすぐ表示されます。
          電話・店頭で受けたぶんだけ、下の「予約を作成」から登録してください。
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <a href="https://frankgolf.jp/trial-booking.html" target="_blank" rel="noreferrer" className={btnGhostCls}>体験予約ページ ↗</a>
          <a href="https://frankgolf.jp/booking.html" target="_blank" rel="noreferrer" className={btnGhostCls}>会員の打席予約 ↗</a>
          <a href="https://frankgolf.jp/lesson-booking.html" target="_blank" rel="noreferrer" className={btnGhostCls}>レッスン予約 ↗</a>
        </div>
      </Panel>

      {/* 未収金サマリ */}
      <Panel title={`未収金サマリ（未収・一部入金 ${unpaidList.length}件）`} className="d1">
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

      {/* 空き状況グリッド */}
      <Panel
        title={`空き状況　${labelJa(date)}${view.closed ? "　定休日" : `　${view.hours?.open}〜${view.hours?.close}`}`}
        className="d2"
      >
        {/* 縦＝時間・横＝打席（#135）。左の月カレンダーで日を選び、空きコマを押すと下の作成フォームに入る */}
        <div className="flex flex-col gap-4 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-56">
            <MonthMiniCalendar
              month={monthOf(date)}
              selected={date}
              today={jstToday()}
              view="day"
              counts={monthData.counts}
              isClosed={(d) => businessHours(d, monthData.cfg) === null}
              href={(p) => `/reservations?date=${p.date ?? date}&step=${p.step ?? step}`}
            />
          </aside>
          <div className="min-w-0 flex-1 space-y-2">
            {view.closed ? (
              <Empty>この日は定休日です（営業時間・定休日は Genesis の /site-admin で変更できます）</Empty>
            ) : (
              <>
                <BayTimeline
                  slots={gridSlots}
                  step={step}
                  bays={bays}
                  items={items}
                  emptyHref={emptyHref}
                  maxHeightClass="max-h-[68vh]"
                />
                <TimelineLegend>
                  <span>空きコマを押すと下の作成フォームに入ります</span>
                  {closedBays.length > 0 && <span>休止中: {closedBays.map((b) => b.name).join("・")}</span>}
                </TimelineLegend>
              </>
            )}
          </div>
        </div>
      </Panel>

      {/* 予約作成 */}
      <Panel title="予約を作成（電話・店頭で受けたぶん）" className="d2">
        {/* 上のタイムラインで空きコマを押すと #booking-form へ飛び、打席と開始時刻が入った状態になる（#135） */}
        <form id="booking-form" action={createBooking} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="booking_date" value={date} />
          <Field label="打席">
            <select name="bay_id" defaultValue={preBay} className={inputCls}>
              {bays.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="開始時刻">
            <select name="start_time" defaultValue={preStart} className={inputCls}>
              {view.slots.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="利用時間">
            <select name="minutes" className={inputCls} defaultValue="60">
              {view.cfg.max_minutes_options.map((m) => <option key={m} value={m}>{m}分</option>)}
            </select>
          </Field>
          <Field label="区分">
            <select name="customer_kind" className={inputCls} defaultValue="dropin">
              <option value="member">会員</option>
              <option value="dropin">都度利用</option>
            </select>
          </Field>
          <Field label="会員番号（会員時）">
            <input name="member_no" placeholder="FR0001" className={inputCls} />
          </Field>
          <Field label="お名前（都度利用時）">
            <input name="guest_name" placeholder="山田 太郎" className={inputCls} />
          </Field>
          <Field label="電話番号">
            <input name="guest_phone" placeholder="090-..." className={inputCls} />
          </Field>
          <Field label="料金（請求額）">
            <input name="amount" inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-4">
            <button className={`${btnCls} w-full justify-center sm:w-auto`}>＋ 予約を登録</button>
          </div>
        </form>
      </Panel>

      {/* 当日の予約一覧 */}
      <Panel title={`予約一覧（${date}）　${live.length}件${trialCount ? `（うち体験 ${trialCount}件）` : ""}`} className="d3">
        {view.bookings.length === 0 ? (
          <Empty>この日の予約はありません</Empty>
        ) : (
          <div className="space-y-2">
            {view.bookings.map((b) => {
              const out = outstanding(b.amount, b.paid_amount, b.payment_status);
              const t = b.mbr_trial_requests;
              return (
                <div key={b.id} className="space-y-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={b.status === "cancelled" ? "default" : b.status === "visited" ? "ok" : b.status === "no_show" ? "danger" : kindTone(b.customer_kind)}>
                        {b.status === "confirmed" ? CUSTOMER_KIND_LABEL[b.customer_kind] : BOOKING_STATUS_LABEL[b.status]}
                      </Badge>
                      <span className="font-semibold tabular-nums">{b.start_time.slice(0, 5)}〜{b.end_time.slice(0, 5)}</span>
                      <span className="font-semibold">{who(b)}</span>
                      {t?.lefty ? <Badge tone="warn">レフティ</Badge> : null}
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
