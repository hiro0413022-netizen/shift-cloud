import type { ReactNode } from "react";
import Link from "next/link";
import { Badge, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { TIMELINE_TONE, labelJa } from "@/lib/bay-timeline-pure";
import type { BookingDetail, LessonDetail } from "@/lib/frank-reservation";
import {
  BOOKING_STATUS_LABEL,
  CUSTOMER_KIND_LABEL,
  PAYMENT_STATUS_LABEL,
  PAY_METHODS,
  outstanding,
} from "@yozan/core/frank-booking";
import { setBookingStatus, recordPayment, updateBooking } from "@/app/(main)/reservations/actions";

/**
 * 予約の詳細（#139・2026-08-18 ユーザー要望）
 *
 * ★ 「カレンダーに出ている名前を押したら詳細が見える」ようにするための表示。
 *   これまでカレンダーのブロックは title 属性（マウスを乗せたときのツールチップ）しか持たず、
 *   店頭PCでは実質「誰か分からない」状態だった。タッチ操作でも読めるように画面へ出す。
 *
 * ★ サーバーコンポーネントのまま実装する
 *   モーダルをクライアントで組むと、カレンダー全体をクライアント化することになる。
 *   ?sel=<予約ID> でこのパネルを出す方式なら、リンク1つで開き、更新にも耐える（URLで共有もできる）。
 */

const LESSON_OS_URL = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";

/**
 * 会員番号でレッスンカルテを開く（2026-08-22 ユーザー依頼）。
 * lesson-os 側の /m/<会員番号> がカルテIDに解決してリダイレクトする（無ければその場で作る）ので、
 * member-os は lsn_students を引かない＝アプリ間の結合を増やさない。
 */
function karteHref(memberNo: string): string {
  return `${LESSON_OS_URL}/m/${encodeURIComponent(memberNo)}`;
}

/** "10:00:00" と "11:30:00" → 90 */
function minutesOf(start: string, end: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(end) - m(start);
}

function yen(n: number | null | undefined): string {
  return n == null ? "—" : `¥${Number(n).toLocaleString("ja-JP")}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 py-1 text-sm">
      <span className="w-24 shrink-0 text-xs text-(--color-dim)">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

function Shell({ title, tone, closeHref, children }: { title: string; tone: string; closeHref: string; children: ReactNode }) {
  return (
    <section className={`hud reveal rounded-2xl border p-4 ${tone}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="text-base font-bold">{title}</h2>
        <Link href={closeHref} className="rounded-lg border border-(--color-line) bg-white/70 px-2 py-1 text-xs text-(--color-dim) hover:text-(--color-txt)">
          閉じる ✕
        </Link>
      </div>
      {children}
    </section>
  );
}

/**
 * 予約1件の詳細パネル。
 * backHref = 閉じたときに戻るURL（?sel= を外したもの）
 * date = 操作後にどの日を再描画するか
 */
export function BookingDetailPanel({
  b,
  backHref,
  date,
  canEdit = true,
  bays = [],
}: {
  b: BookingDetail;
  backHref: string;
  date: string;
  canEdit?: boolean;
  /** 打席の選択肢。渡すと「日時・打席を変更」フォームが出る（#151） */
  bays?: Array<{ id: string; name: string }>;
}) {
  const kind = b.customer_kind === "trial" ? "trial" : b.customer_kind === "member" ? "member" : "dropin";
  const m = b.frunk_members;
  const t = b.mbr_trial_requests;
  const name = m?.name ?? t?.name ?? b.guest_name ?? "（名称未入力）";
  const kana = m?.name_kana ?? t?.name_kana ?? null;
  const phone = m?.phone ?? t?.phone ?? b.guest_phone ?? null;
  const email = m?.email ?? t?.email ?? null;
  const out = outstanding(b.amount, b.paid_amount, b.payment_status);

  return (
    <Shell
      title={`${labelJa(b.booked_date)} ${b.start_time.slice(0, 5)}〜${b.end_time.slice(0, 5)}　${name} 様`}
      tone={TIMELINE_TONE[kind].block}
      closeHref={backHref}
    >
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-(--color-txt)">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone={kind === "member" ? "accent" : kind === "trial" ? "gold" : "ok"}>
            {CUSTOMER_KIND_LABEL[b.customer_kind] ?? b.customer_kind}
          </Badge>
          <Badge tone={b.status === "visited" ? "ok" : b.status === "no_show" ? "danger" : b.status === "cancelled" ? "default" : "accent"}>
            {BOOKING_STATUS_LABEL[b.status] ?? b.status}
          </Badge>
          {t?.lefty ? <Badge tone="warn">レフティ</Badge> : null}
          {m?.alert_note ? <Badge tone="danger">⚠ {m.alert_note}</Badge> : null}
        </div>

        <div className="grid gap-x-6 sm:grid-cols-2">
          <div>
            <Row label="お名前">
              {name}
              {kana ? <span className="ml-2 text-xs text-(--color-dim)">{kana}</span> : null}
            </Row>
            {m ? (
              <Row label="会員">
                {m.member_no}　{m.frunk_plans?.name ?? "プラン未設定"}
                <Link href={`/frunk/${m.id}`} className="ml-2 text-xs text-indigo-600 underline">
                  会員カードを開く →
                </Link>
                {m.member_no ? (
                  <a href={karteHref(m.member_no)} target="_blank" rel="noreferrer" className="ml-2 text-xs text-indigo-600 underline">
                    レッスンカルテ ↗
                  </a>
                ) : null}
              </Row>
            ) : null}
            <Row label="電話">{phone ? <a href={`tel:${phone}`} className="text-indigo-600 underline">{phone}</a> : "—"}</Row>
            <Row label="メール">{email ?? "—"}</Row>
            {b.party_size && b.party_size > 1 ? <Row label="人数">{b.party_size}名</Row> : null}
          </div>
          <div>
            <Row label="打席">
              {b.frunk_bays?.name ?? "—"}
              {b.frunk_bays?.equipment ? <span className="ml-2 text-xs text-(--color-dim)">{b.frunk_bays.equipment}</span> : null}
            </Row>
            <Row label="日時">
              {b.booked_date}　{b.start_time.slice(0, 5)}〜{b.end_time.slice(0, 5)}
              {canEdit && bays.length > 0 ? (
                <span className="ml-2 text-xs text-(--color-dim)">（下の「日時・打席を変更」から直せます）</span>
              ) : null}
            </Row>
            <Row label="会計">
              <span className="tabular-nums">
                請求 {yen(b.amount)} ／ 入金 {yen(b.paid_amount)}
              </span>
              <span className="ml-2">
                <Badge tone={b.payment_status === "paid" ? "ok" : b.payment_status === "partial" ? "warn" : b.payment_status === "waived" ? "default" : "danger"}>
                  {PAYMENT_STATUS_LABEL[b.payment_status] ?? b.payment_status}
                </Badge>
              </span>
              {out > 0 ? <span className="ml-2 font-semibold text-rose-600">未収 {yen(out)}</span> : null}
            </Row>
            <Row label="受付経路">{b.source === "trial" ? "公式サイト（体験）" : b.source === "staff" ? "店頭・電話" : (b.source ?? "—")}</Row>
          </div>
        </div>

        {t?.experience ? <Row label="ゴルフ歴">{t.experience}</Row> : null}
        {t?.message ? <Row label="ご要望">{t.message}</Row> : null}
        {b.note ? <Row label="備考">{b.note}</Row> : null}

        {canEdit && bays.length > 0 && (
          <details className="mt-3 rounded-xl border border-(--color-line) bg-(--color-panel-2) p-3">
            <summary className="cursor-pointer text-sm font-semibold">日時・打席を変更する</summary>
            <p className="mt-1 text-xs text-(--color-dim)">
              お客様から変更の連絡が来たときはここで直します。消して作り直す必要はありません。
              {b.mbr_trial_requests ? "体験申込と受付台帳の日付も一緒に直ります。" : ""}
            </p>
            <form action={updateBooking} className="mt-2 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="date" value={date} />
              <label className="text-xs text-(--color-dim)">
                日付
                <input type="date" name="booking_date" defaultValue={b.booked_date} className={inputCls} />
              </label>
              <label className="text-xs text-(--color-dim)">
                開始時刻
                <input type="time" name="start_time" defaultValue={b.start_time.slice(0, 5)} step={900} className={inputCls} />
              </label>
              <label className="text-xs text-(--color-dim)">
                所要（分）
                <input
                  name="minutes"
                  inputMode="numeric"
                  defaultValue={String(Math.max(15, minutesOf(b.start_time, b.end_time)))}
                  className={inputCls}
                />
              </label>
              <label className="text-xs text-(--color-dim)">
                打席
                <select name="bay_id" defaultValue={b.bay_id ?? ""} className={inputCls}>
                  {bays.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </label>
              {!b.frunk_members ? (
                <>
                  <label className="text-xs text-(--color-dim)">
                    お名前
                    <input name="guest_name" defaultValue={b.guest_name ?? ""} className={inputCls} />
                  </label>
                  <label className="text-xs text-(--color-dim)">
                    電話
                    <input name="guest_phone" defaultValue={b.guest_phone ?? ""} className={inputCls} />
                  </label>
                </>
              ) : null}
              <label className="text-xs text-(--color-dim)">
                人数
                <input name="party_size" inputMode="numeric" defaultValue={String(b.party_size ?? 1)} className={inputCls} />
              </label>
              <label className="text-xs text-(--color-dim) sm:col-span-2">
                備考
                <input name="note" defaultValue={b.note ?? ""} className={inputCls} />
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-xs text-(--color-dim)">
                  <input type="checkbox" name="notify" value="1" />
                  お客様にメールで知らせる
                </label>
                <button className={btnCls}>変更を保存</button>
                <span className="text-[11px] text-(--color-dim)">
                  ※ 定休日・営業時間外、他の予約やレッスン枠と重なる時間には動かせません
                </span>
              </div>
            </form>
          </details>
        )}

        {canEdit && (
          <div className="mt-3 space-y-2 border-t border-(--color-line) pt-3">
            <div className="flex flex-wrap items-center gap-2">
              {b.status !== "visited" && (
                <form action={setBookingStatus}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="status" value="visited" />
                  <button className={btnCls}>来店にする</button>
                </form>
              )}
              {b.status !== "no_show" && (
                <form action={setBookingStatus}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="status" value="no_show" />
                  <button className={btnGhostCls}>無断欠</button>
                </form>
              )}
              {b.status !== "cancelled" && (
                <form action={setBookingStatus}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="status" value="cancelled" />
                  <button className={btnGhostCls}>取消</button>
                </form>
              )}
              <Link href={`/reservations?date=${b.booked_date}`} className={btnGhostCls}>
                予約管理で開く →
              </Link>
              {m?.member_no ? (
                <a href={karteHref(m.member_no)} target="_blank" rel="noreferrer" className={btnGhostCls}>
                  レッスンカルテを開く ↗
                </a>
              ) : null}
            </div>

            <form action={recordPayment} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="date" value={date} />
              <label className="flex items-center gap-1 text-xs text-(--color-dim)">
                請求
                <input name="amount" inputMode="numeric" defaultValue={b.amount != null ? String(b.amount) : ""} className={`${inputCls} !w-24 !py-1`} />
              </label>
              <label className="flex items-center gap-1 text-xs text-(--color-dim)">
                入金
                <input name="paid_amount" inputMode="numeric" defaultValue={String(b.paid_amount)} className={`${inputCls} !w-24 !py-1`} />
              </label>
              <select name="payment_method" defaultValue={b.payment_method ?? ""} className={`${inputCls} !w-28 !py-1`}>
                <option value="">方法</option>
                {PAY_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button name="mode" value="partial" className={btnGhostCls}>記録</button>
              <button name="mode" value="full" className={btnCls}>全額入金</button>
            </form>
          </div>
        )}
      </div>
    </Shell>
  );
}

/** レッスン枠の詳細（打席を押さえている枠なので、誰の枠か分かるようにする） */
export function LessonDetailPanel({ l, backHref }: { l: LessonDetail; backHref: string }) {
  return (
    <Shell
      title={`${labelJa(l.slot_date)} ${l.start_time.slice(0, 5)}〜${l.end_time.slice(0, 5)}　レッスン枠`}
      tone={TIMELINE_TONE.lesson.block}
      closeHref={backHref}
    >
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-(--color-txt)">
        <Row label="コーチ">{l.staff?.name ?? "—"}</Row>
        <Row label="打席">{l.frunk_bays?.name ?? "打席指定なし"}</Row>
        <Row label="状態">{l.status === "open" ? "受付中" : l.status}</Row>
        <Row label="予約者">
          {l.booking ? `${l.booking.member_name ?? "（氏名未設定）"}　${l.booking.member_no ?? ""}` : "まだ予約が入っていません"}
        </Row>
        {l.note ? <Row label="備考">{l.note}</Row> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {l.booking?.member_no ? (
            <a href={karteHref(l.booking.member_no)} target="_blank" rel="noreferrer" className={btnGhostCls}>
              この生徒のカルテを開く ↗
            </a>
          ) : null}
          <a href={`${LESSON_OS_URL}/frank`} target="_blank" rel="noreferrer" className={btnGhostCls}>
            レッスン管理システム ↗
          </a>
        </div>
      </div>
    </Shell>
  );
}
