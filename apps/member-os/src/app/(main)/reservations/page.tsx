import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import {
  genSlots, BOOKING_STATUS_LABEL, CUSTOMER_KIND, HIMEJI_STORE_CODE,
  PAYMENT_STATUS_LABEL, PAY_METHODS, outstanding,
} from "@/lib/reservation";
import { createBooking, setBookingStatus, deleteBooking, issueBookingToken, issueBoardToken, recordPayment } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}
function payTone(status: string): "default" | "ok" | "warn" | "danger" | "accent" {
  return status === "paid" ? "ok" : status === "partial" ? "warn" : status === "waived" ? "default" : "danger";
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; booking_url?: string; board_url?: string; err?: string }>;
}) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : today();

  const { data: store } = await admin
    .from("stores").select("id, name, open_time, close_time")
    .eq("company_id", actor.companyId).eq("code", HIMEJI_STORE_CODE).maybeSingle();

  if (!store) {
    return <Empty>FRANK GOLF 姫路の店舗が見つかりません（migration 0020 の適用をご確認ください）。</Empty>;
  }

  const [{ data: resources }, { data: bookings }, { data: outstandingRows }] = await Promise.all([
    admin.from("res_resources").select("id, name, kind").eq("store_id", store.id).is("deleted_at", null).order("sort_order"),
    admin.from("res_bookings").select("*").eq("store_id", store.id).is("deleted_at", null).eq("booking_date", date).order("start_time"),
    admin.from("res_bookings").select("*").eq("store_id", store.id).is("deleted_at", null)
      .in("payment_status", ["unpaid", "partial"]).neq("status", "canceled")
      .not("amount", "is", null).order("booking_date", { ascending: true }).limit(300),
  ]);

  const resList = (resources ?? []) as Row[];
  const bkList = (bookings ?? []) as Row[];
  const slots = genSlots(store.open_time as string | null, store.close_time as string | null);

  const byCell = new Map<string, Row>();
  for (const b of bkList) {
    if (b.status !== "canceled") byCell.set(`${b.resource_id}|${String(b.start_time).slice(0, 5)}`, b);
  }
  const resName = (rid: unknown) => resList.find((r) => r.id === rid)?.name;

  // 未収金サマリ（全期間・完済/免除を除く）
  const unpaidList = ((outstandingRows ?? []) as Row[])
    .map((b) => ({ b, out: outstanding(b.amount as number | null, b.paid_amount as number | null, String(b.payment_status)) }))
    .filter((x) => x.out > 0);
  const unpaidTotal = unpaidList.reduce((s, x) => s + x.out, 0);

  const bookingUrl = sp.booking_url ?? null;
  const boardUrl = sp.board_url ?? null;

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">予約管理 — FRANK GOLF 姫路</h1>
          <p className="text-sm text-(--color-dim)">打席・レッスンの枠管理、電話/店頭予約、お客様Web予約、入金・未収金の管理</p>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={date} className={inputCls} />
          <button className={btnGhostCls}>表示</button>
        </form>
      </header>

      {sp.err && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{sp.err}</p>}

      {bookingUrl && (
        <Panel title="お客様Web予約URL（QR掲示・HP掲載用・一度だけ表示）" className="d1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-xs text-indigo-600">{bookingUrl}</code>
            <a href={bookingUrl} target="_blank" rel="noreferrer" className={btnCls}>予約画面を開く ↗</a>
          </div>
        </Panel>
      )}

      {boardUrl && (
        <Panel title="店頭カレンダーURL（ロビー掲示・常設タブレット用・一度だけ表示）" className="d1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-xs text-amber-700">{boardUrl}</code>
            <a href={boardUrl} target="_blank" rel="noreferrer" className={btnCls}>カレンダーを開く ↗</a>
          </div>
        </Panel>
      )}

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
                <div key={String(b.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={payTone(String(b.payment_status))}>{PAYMENT_STATUS_LABEL[String(b.payment_status)]}</Badge>
                    <span className="font-semibold">{b.guest_name ? String(b.guest_name) : b.member_no ? `会員 ${String(b.member_no)}` : "（名称未入力）"}</span>
                    <span className="text-xs text-(--color-dim)">
                      {[String(b.booking_date), String(b.start_time).slice(0, 5), resName(b.resource_id) && String(resName(b.resource_id))].filter(Boolean).join("　")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-(--color-dim)">請求 {yen(Number(b.amount))}／入金 {yen(Number(b.paid_amount ?? 0))}</span>
                    <span className="font-semibold tabular-nums text-rose-600">未収 {yen(out)}</span>
                    <form action={recordPayment}>
                      <input type="hidden" name="id" value={String(b.id)} />
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

      {/* 空き状況グリッド（大型・見やすく） */}
      <Panel title={`空き状況（${date}）`} className="d2">
        <div className="overflow-x-auto pb-1">
          <div className="min-w-max">
            {/* 時間ヘッダー */}
            <div className="flex">
              <div className="sticky left-0 z-10 w-28 shrink-0 bg-(--color-panel) px-2 py-2 text-xs font-semibold text-(--color-dim)">枠 ＼ 時間</div>
              {slots.map((s) => (
                <div key={s} className="w-20 shrink-0 px-1 py-2 text-center text-xs font-semibold text-(--color-dim)">{s}</div>
              ))}
            </div>
            {resList.map((r) => (
              <div key={String(r.id)} className="flex border-t border-(--color-line)">
                <div className="sticky left-0 z-10 flex w-28 shrink-0 items-center bg-(--color-panel) px-2 py-1.5 text-sm font-semibold whitespace-nowrap">{String(r.name)}</div>
                {slots.map((s) => {
                  const b = byCell.get(`${r.id}|${s}`);
                  if (!b) {
                    return (
                      <div key={s} className="w-20 shrink-0 px-1 py-1.5">
                        <div className="h-11 rounded-lg border border-dashed border-(--color-line) bg-(--color-panel-2)" />
                      </div>
                    );
                  }
                  const member = String(b.customer_kind) === "member";
                  const nm = b.guest_name ? String(b.guest_name) : b.member_no ? `会員 ${String(b.member_no)}` : "予約";
                  return (
                    <div key={s} className="w-20 shrink-0 px-1 py-1.5">
                      <div className={`flex h-11 flex-col justify-center overflow-hidden rounded-lg px-1.5 text-[11px] leading-tight ${member ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800"}`}>
                        <span className="truncate font-semibold">{nm}</span>
                        <span className="truncate opacity-70">{member ? "会員" : "都度"}{b.party_size ? `・${String(b.party_size)}名` : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-(--color-dim)">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded bg-indigo-100" />会員予約</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded bg-emerald-100" />都度予約</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded border border-dashed border-(--color-line) bg-(--color-panel-2)" />空き</span>
        </div>
      </Panel>

      {/* 予約作成 */}
      <Panel title="予約を作成（電話・店頭）" className="d2">
        <form action={createBooking} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="booking_date" value={date} />
          <Field label="枠">
            <select name="resource_id" className={inputCls}>
              {resList.map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.name)}</option>)}
            </select>
          </Field>
          <Field label="開始時刻">
            <select name="start_time" className={inputCls}>
              {slots.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="区分">
            <select name="customer_kind" className={inputCls} defaultValue="dropin">
              {CUSTOMER_KIND.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="会員番号（会員時）">
            <input name="member_no" placeholder="010026..." className={inputCls} />
          </Field>
          <Field label="お名前">
            <input name="guest_name" placeholder="山田 太郎" className={inputCls} />
          </Field>
          <Field label="電話番号">
            <input name="guest_phone" placeholder="090-..." className={inputCls} />
          </Field>
          <Field label="人数">
            <input name="party_size" inputMode="numeric" defaultValue="1" className={inputCls} />
          </Field>
          <Field label="料金（請求額）">
            <input name="amount" inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button className={`${btnCls} w-full justify-center`}>＋ 予約</button>
          </div>
        </form>
      </Panel>

      {/* 当日の予約一覧 */}
      <Panel title={`予約一覧（${date}）`} className="d3">
        {bkList.length === 0 ? (
          <Empty>この日の予約はありません</Empty>
        ) : (
          <div className="space-y-2">
            {bkList.map((b) => {
              const status = String(b.status);
              const payStatus = String(b.payment_status ?? "unpaid");
              const out = outstanding(b.amount as number | null, b.paid_amount as number | null, payStatus);
              return (
                <div key={String(b.id)} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={status === "canceled" ? "default" : status === "visited" ? "ok" : status === "no_show" ? "danger" : "accent"}>
                        {BOOKING_STATUS_LABEL[status] ?? status}
                      </Badge>
                      <span className="font-semibold">{b.guest_name ? String(b.guest_name) : b.member_no ? `会員 ${String(b.member_no)}` : "（名称未入力）"}</span>
                      <span className="text-xs text-(--color-dim)">
                        {[String(b.start_time).slice(0, 5), resName(b.resource_id) && String(resName(b.resource_id)), String(b.customer_kind) === "member" ? "会員" : "都度", b.party_size && `${b.party_size}名`, b.source === "web" && "Web"].filter(Boolean).join("　")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {status !== "visited" && (
                        <form action={setBookingStatus}><input type="hidden" name="id" value={String(b.id)} /><input type="hidden" name="status" value="visited" /><button className={btnGhostCls}>来店</button></form>
                      )}
                      {status !== "no_show" && (
                        <form action={setBookingStatus}><input type="hidden" name="id" value={String(b.id)} /><input type="hidden" name="status" value="no_show" /><button className={btnGhostCls}>無断欠</button></form>
                      )}
                      {status !== "canceled" && (
                        <form action={setBookingStatus}><input type="hidden" name="id" value={String(b.id)} /><input type="hidden" name="status" value="canceled" /><button className={btnGhostCls}>取消</button></form>
                      )}
                      <form action={deleteBooking}><input type="hidden" name="id" value={String(b.id)} /><button className="text-xs text-(--color-dim) hover:text-red-400">削除</button></form>
                    </div>
                  </div>

                  {/* 入金行 */}
                  <form action={recordPayment} className="flex flex-wrap items-center gap-2 border-t border-(--color-line) pt-2">
                    <input type="hidden" name="id" value={String(b.id)} />
                    <Badge tone={payTone(payStatus)}>{PAYMENT_STATUS_LABEL[payStatus]}</Badge>
                    <label className="flex items-center gap-1 text-xs text-(--color-dim)">請求
                      <input name="amount" inputMode="numeric" defaultValue={b.amount != null ? String(b.amount) : ""} className={`${inputCls} !w-24 !py-1`} />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-(--color-dim)">入金
                      <input name="paid_amount" inputMode="numeric" defaultValue={b.paid_amount != null ? String(b.paid_amount) : ""} className={`${inputCls} !w-24 !py-1`} />
                    </label>
                    <select name="payment_method" defaultValue={b.payment_method ? String(b.payment_method) : ""} className={`${inputCls} !w-28 !py-1`}>
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

      {/* URL発行 */}
      <Panel title="公開URLの発行" className="d3">
        <p className="mb-3 text-xs text-(--color-dim)">HP掲載やQR掲示、ロビー掲示に使うURLを発行します（発行すると同種の旧URLは無効化）。</p>
        <div className="flex flex-wrap gap-2">
          <form action={issueBookingToken}>
            <button className={btnCls}>お客様Web予約URLを発行</button>
          </form>
          <form action={issueBoardToken}>
            <button className={btnGhostCls}>店頭カレンダーURLを発行</button>
          </form>
        </div>
      </Panel>
    </div>
  );
}
