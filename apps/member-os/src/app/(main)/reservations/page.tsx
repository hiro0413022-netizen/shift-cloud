import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { genSlots, BOOKING_STATUS_LABEL, CUSTOMER_KIND, HIMEJI_STORE_CODE } from "@/lib/reservation";
import { createBooking, setBookingStatus, deleteBooking, issueBookingToken } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; booking_url?: string; err?: string }>;
}) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? (sp.date as string) : today();

  const { data: store } = await admin
    .from("stores").select("id, name, open_time, close_time")
    .eq("company_id", actor.companyId).eq("code", HIMEJI_STORE_CODE).maybeSingle();

  if (!store) {
    return <Empty>FRUNK GOLF 姫路の店舗が見つかりません（migration 0020 の適用をご確認ください）。</Empty>;
  }

  const [{ data: resources }, { data: bookings }] = await Promise.all([
    admin.from("res_resources").select("id, name, kind").eq("store_id", store.id).is("deleted_at", null).order("sort_order"),
    admin.from("res_bookings").select("*").eq("store_id", store.id).is("deleted_at", null).eq("booking_date", date).order("start_time"),
  ]);

  const resList = (resources ?? []) as Row[];
  const bkList = (bookings ?? []) as Row[];
  const slots = genSlots(store.open_time as string | null, store.close_time as string | null);

  const byCell = new Map<string, Row>();
  for (const b of bkList) {
    if (b.status !== "canceled") byCell.set(`${b.resource_id}|${String(b.start_time).slice(0, 5)}`, b);
  }

  const bookingUrl = sp.booking_url ?? null;

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">予約管理 — FRUNK GOLF 姫路</h1>
          <p className="text-sm text-[--color-dim]">打席・レッスンの枠を管理し、電話/店頭予約の入力とお客様Web予約を受け付けます</p>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={date} className={inputCls} />
          <button className={btnGhostCls}>表示</button>
        </form>
      </header>

      {sp.err && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{sp.err}</p>}

      {bookingUrl && (
        <Panel title="お客様Web予約URL（QR掲示・HP掲載用・一度だけ表示）" className="d1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-xs text-sky-300">{bookingUrl}</code>
            <a href={bookingUrl} target="_blank" rel="noreferrer" className={btnCls}>予約画面を開く ↗</a>
          </div>
        </Panel>
      )}

      {/* 空き状況グリッド */}
      <Panel title={`空き状況（${date}）`} className="d1">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-[--color-panel] p-1 text-left">枠 \ 時間</th>
                {slots.map((s) => <th key={s} className="p-1 font-normal text-[--color-dim]">{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {resList.map((r) => (
                <tr key={String(r.id)} className="border-t border-[--color-line]">
                  <td className="sticky left-0 bg-[--color-panel] p-1 font-semibold whitespace-nowrap">{String(r.name)}</td>
                  {slots.map((s) => {
                    const b = byCell.get(`${r.id}|${s}`);
                    return (
                      <td key={s} className={`p-1 text-center ${b ? "bg-sky-500/15 text-sky-300" : "text-[--color-dim]/40"}`}>
                        {b ? (String(b.customer_kind) === "member" ? "会" : "○") : "・"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-[--color-dim]">○=予約 / 会=会員予約 / ・=空き</p>
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
          <Field label="料金">
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
              const resource = resList.find((r) => r.id === b.resource_id);
              const status = String(b.status);
              return (
                <div key={String(b.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[--color-line] bg-[--color-panel-2] p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={status === "canceled" ? "default" : status === "visited" ? "ok" : status === "no_show" ? "danger" : "accent"}>
                      {BOOKING_STATUS_LABEL[status] ?? status}
                    </Badge>
                    <span className="font-semibold">{b.guest_name ? String(b.guest_name) : b.member_no ? `会員 ${String(b.member_no)}` : "（名称未入力）"}</span>
                    <span className="text-xs text-[--color-dim]">
                      {[String(b.start_time).slice(0, 5), resource && String(resource.name), String(b.customer_kind) === "member" ? "会員" : "都度", b.party_size && `${b.party_size}名`, b.source === "web" && "Web", b.amount != null && `¥${Number(b.amount).toLocaleString("ja-JP")}`].filter(Boolean).join("　")}
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
                    <form action={deleteBooking}><input type="hidden" name="id" value={String(b.id)} /><button className="text-xs text-[--color-dim] hover:text-red-400">削除</button></form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Web予約URL発行 */}
      <Panel title="お客様Web予約URLの発行" className="d3">
        <p className="mb-2 text-xs text-[--color-dim]">HP掲載やQR掲示用の予約URLを発行します（発行すると旧URLは無効化）。</p>
        <form action={issueBookingToken}>
          <button className={btnCls}>Web予約URLを発行</button>
        </form>
      </Panel>
    </div>
  );
}
