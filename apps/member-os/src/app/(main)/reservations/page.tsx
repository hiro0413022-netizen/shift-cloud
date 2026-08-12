import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { loadDay, loadUnpaid, occupancy, lessonOccupancy, type BookingRow } from "@/lib/frank-reservation";
import {
  BOOKING_STATUS_LABEL,
  CUSTOMER_KIND_LABEL,
  PAYMENT_STATUS_LABEL,
  PAY_METHODS,
  jstToday,
  outstanding,
} from "@yozan/core/frank-booking";
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
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireReceptionActor();
  // 店舗またぎ廃止（#134）: FRANK姫路に配属されていない人には存在ごと見せない
  if (!canAccessFrank(actor)) notFound();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : jstToday();

  const [view, unpaidRows] = await Promise.all([
    loadDay(date, actor.companyId),
    loadUnpaid(actor.companyId),
  ]);
  const bays = view.bays.filter((b) => b.active);
  const closedBays = view.bays.filter((b) => !b.active);
  const cells = occupancy(view);
  const lessonCells = lessonOccupancy(view);
  const live = view.bookings.filter((b) => b.status !== "cancelled");

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
        title={`空き状況（${date}）${view.closed ? "　定休日" : `　${view.hours?.open}〜${view.hours?.close}`}`}
        className="d2"
      >
        {view.closed ? (
          <Empty>この日は定休日です（営業時間・定休日は Genesis の /site-admin で変更できます）</Empty>
        ) : (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="min-w-max">
                <div className="flex">
                  <div className="sticky left-0 z-10 w-32 shrink-0 bg-(--color-panel) px-2 py-2 text-xs font-semibold text-(--color-dim)">打席 ＼ 時間</div>
                  {view.slots.map((s) => (
                    <div key={s} className="w-16 shrink-0 px-1 py-2 text-center text-xs font-semibold text-(--color-dim)">{s}</div>
                  ))}
                </div>
                {bays.map((r) => (
                  <div key={r.id} className="flex border-t border-(--color-line)">
                    <div className="sticky left-0 z-10 flex w-32 shrink-0 flex-col justify-center bg-(--color-panel) px-2 py-1.5 whitespace-nowrap">
                      <span className="text-sm font-semibold">{r.name}</span>
                      <span className="text-[10px] text-(--color-dim)">
                        {[`${r.floor}F`, r.equipment, r.is_lefty ? "左右打席" : null].filter(Boolean).join("・")}
                      </span>
                    </div>
                    {view.slots.map((s) => {
                      const b = cells.get(`${r.id}|${s}`);
                      const l = lessonCells.get(`${r.id}|${s}`);
                      if (!b && !l) {
                        return (
                          <div key={s} className="w-16 shrink-0 px-0.5 py-1.5">
                            <div className="h-11 rounded-lg border border-dashed border-(--color-line) bg-(--color-panel-2)" />
                          </div>
                        );
                      }
                      if (!b && l) {
                        return (
                          <div key={s} className="w-16 shrink-0 px-0.5 py-1.5">
                            <div className="flex h-11 flex-col justify-center overflow-hidden rounded-lg bg-violet-100 px-1 text-[10px] leading-tight text-violet-800">
                              <span className="truncate font-semibold">レッスン</span>
                              <span className="truncate opacity-70">{l.staff?.name ?? ""}</span>
                            </div>
                          </div>
                        );
                      }
                      const bk = b as BookingRow;
                      const tone =
                        bk.customer_kind === "trial" ? "bg-amber-100 text-amber-900"
                        : bk.customer_kind === "member" ? "bg-indigo-100 text-indigo-800"
                        : "bg-emerald-100 text-emerald-800";
                      return (
                        <div key={s} className="w-16 shrink-0 px-0.5 py-1.5">
                          <div className={`flex h-11 flex-col justify-center overflow-hidden rounded-lg px-1 text-[10px] leading-tight ${tone}`}>
                            <span className="truncate font-semibold">{who(bk)}</span>
                            <span className="truncate opacity-70">
                              {CUSTOMER_KIND_LABEL[bk.customer_kind]}
                              {bk.mbr_trial_requests?.lefty ? "・左" : ""}
                              {bk.status === "visited" ? "・来店" : bk.status === "no_show" ? "・欠" : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-(--color-dim)">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded bg-indigo-100" />会員</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded bg-amber-100" />体験</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded bg-emerald-100" />都度</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded bg-violet-100" />レッスン枠</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded border border-dashed border-(--color-line) bg-(--color-panel-2)" />空き</span>
              {closedBays.length > 0 && <span>休止中: {closedBays.map((b) => b.name).join("・")}</span>}
            </div>
          </>
        )}
      </Panel>

      {/* 予約作成 */}
      <Panel title="予約を作成（電話・店頭で受けたぶん）" className="d2">
        <form action={createBooking} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="booking_date" value={date} />
          <Field label="打席">
            <select name="bay_id" className={inputCls}>
              {bays.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="開始時刻">
            <select name="start_time" className={inputCls}>
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
