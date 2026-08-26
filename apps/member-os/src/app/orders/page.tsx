import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@yozan/core/jst";
import { loadMenu } from "@/lib/frank-portal";
import { markServed, cancelOrder, addStaffOrder, checkOutSeat } from "./actions";
import { OrdersLive } from "./live";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/**
 * 電子伝票（受付iPad・#154 / 構想 §4）
 *
 * 会員のモバイルオーダーと、スタッフが口頭で受けた注文を **1画面に集約**する。
 * 打席順に並べるのは「どこに持っていくか」が伝票の第一情報だから。
 * この画面はスタッフ側を向いている前提（お客様側はチェックイン用PC）。
 */
export default async function OrdersPage() {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) notFound();

  const admin = createAdmin();
  const today = jstYmd();

  const [{ data: bayRows }, { data: orderRows }, { data: checkinRows }] = await Promise.all([
    admin.from("frunk_bays").select("id, name").eq("active", true).is("deleted_at", null).order("sort", { ascending: true }),
    admin.from("frunk_orders")
      .select("id, order_no, bay_id, member_id, guest_label, status, payment_status, amount, ordered_at, payment_error, source, frunk_members(member_no, name), frunk_order_items(id, name, qty, unit_price, amount)")
      .eq("ordered_on", today).neq("status", "cancelled").is("deleted_at", null)
      .order("ordered_at", { ascending: true }),
    admin.from("frunk_checkins")
      .select("id, bay_id, checked_out_at, frunk_members(member_no, name)")
      .eq("visited_on", today).is("deleted_at", null),
  ]);

  const bays = ((bayRows ?? []) as Row[]).map((b) => ({ id: s(b.id), name: s(b.name) }));
  const orders = (orderRows ?? []) as Row[];
  const checkins = (checkinRows ?? []) as Row[];
  const menu = await loadMenu(actor.companyId);

  const open = orders.filter((o) => s(o.status) === "open");
  // 新しい注文が入ったら音を鳴らすための指紋（件数と最新IDが変われば鳴る）
  const signature = `${open.length}:${s(open[open.length - 1]?.id)}`;

  const seatOf = (bayId: string): { label: string; checkinId: string } | null => {
    const c = checkins.find((x) => s(x.bay_id) === bayId && !s(x.checked_out_at));
    const m = (c?.frunk_members as { member_no?: string; name?: string } | null) ?? null;
    return c && m ? { label: `${m.name} 様（${m.member_no}）`, checkinId: s(c.id) } : null;
  };
  const groups: Array<{ id: string | null; name: string; seat: ReturnType<typeof seatOf>; rows: Row[] }> = [
    ...bays.map((b) => ({ id: b.id, name: b.name, seat: seatOf(b.id), rows: orders.filter((o) => s(o.bay_id) === b.id) })),
    { id: null, name: "打席なし", seat: null, rows: orders.filter((o) => !s(o.bay_id)) },
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 py-6">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF</p>
          <h1 className="text-2xl font-bold tracking-wide">電子伝票</h1>
          <p className="text-xs text-(--color-dim)">
            {today} ／ 未提供 {open.length}件
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/orders/menu" className="text-xs text-(--color-dim) underline underline-offset-4">メニュー管理</Link>
          <Link href="/orders/qr" className="text-xs text-(--color-dim) underline underline-offset-4">打席QRを印刷</Link>
          <OrdersLive signature={signature} unserved={open.length} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => {
          if (g.rows.length === 0 && !g.seat && g.id === null) return null;
          const memberId = s(g.rows.find((o) => s(o.member_id))?.member_id) || "";
          return (
            <section key={g.id ?? "none"} className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{g.name}</h2>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs text-(--color-dim)">{g.seat?.label ?? "—"}</span>
                  {g.seat && (
                    <form action={checkOutSeat}>
                      <input type="hidden" name="checkin_id" value={g.seat.checkinId} />
                      <button className="shrink-0 rounded-lg border border-(--color-line) px-2 py-1 text-[11px] text-(--color-dim)">退店</button>
                    </form>
                  )}
                </span>
              </div>

              {g.rows.length === 0 ? (
                <p className="py-3 text-center text-sm text-(--color-dim)">注文はありません</p>
              ) : (
                <div className="space-y-2">
                  {g.rows.map((o) => {
                    const items = (o.frunk_order_items ?? []) as Row[];
                    const mem = (o.frunk_members as { member_no?: string; name?: string } | null) ?? null;
                    const served = s(o.status) === "served";
                    const paid = s(o.payment_status) === "paid";
                    return (
                      <div key={s(o.id)} className={`rounded-xl border px-3 py-2.5 ${served ? "border-(--color-line) bg-(--color-panel-2) opacity-60" : "border-(--color-accent)/30 bg-white"}`}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-(--color-dim)">{s(o.order_no)}</span>
                          <span className={paid ? "rounded bg-(--color-accent)/10 px-2 py-0.5 text-(--color-accent)" : "rounded bg-amber-100 px-2 py-0.5 text-amber-800"}>
                            {paid ? "決済済" : "未決済（退店時）"}
                          </span>
                        </div>
                        <p className="text-xs text-(--color-dim)">
                          {mem ? `${mem.name} 様` : (s(o.guest_label) || "ビジター")}
                          {s(o.source) === "staff" ? " ・ 口頭" : ""}
                        </p>
                        <ul className="my-1.5 space-y-0.5 text-sm">
                          {items.map((it) => (
                            <li key={s(it.id)} className="flex justify-between">
                              <span>{s(it.name)} × {n(it.qty)}</span>
                              <span className="tabular-nums text-(--color-dim)">¥{n(it.amount).toLocaleString("ja-JP")}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold tabular-nums">¥{n(o.amount).toLocaleString("ja-JP")}</span>
                          <div className="flex gap-1.5">
                            {!served && (
                              <form action={markServed}>
                                <input type="hidden" name="id" value={s(o.id)} />
                                <button className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">提供済み</button>
                              </form>
                            )}
                            <form action={cancelOrder}>
                              <input type="hidden" name="id" value={s(o.id)} />
                              <button className="rounded-lg border border-(--color-line) px-2.5 py-1.5 text-xs text-(--color-dim)">取消</button>
                            </form>
                          </div>
                        </div>
                        {s(o.payment_error) && (
                          <p className="mt-1 text-[11px] text-(--color-warn)">カード決済が通りませんでした（退店時にレジでお会計）</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 口頭で受けた注文をここから足す。同じ打席の伝票としてまとまって見える */}
              <form action={addStaffOrder} className="mt-3 flex gap-1.5 border-t border-(--color-line) pt-3">
                <input type="hidden" name="bay_id" value={g.id ?? ""} />
                <input type="hidden" name="member_id" value={memberId} />
                <select name="menu_item_id" defaultValue="" className="min-w-0 flex-1 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm">
                  <option value="" disabled>口頭注文を追加…</option>
                  {menu.filter((m) => !m.sold_out).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <input name="qty" type="number" min={1} max={20} defaultValue={1} className="w-16 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm" />
                <button className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm">追加</button>
              </form>
            </section>
          );
        })}
      </div>
    </main>
  );
}
