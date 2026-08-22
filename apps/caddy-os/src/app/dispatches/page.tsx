import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { getDispatches, getMasters, getMonthCounts, summarize, byStaff, currentYm, yen, dispatchCost } from "@/lib/caddy";
import { MonthNav } from "@/components/month-nav";
import { clientTone, dispatchChipCls } from "@/lib/client-colors";
import { STATUS_LABEL } from "@/lib/shift";
import { BulkGrid } from "./bulk-grid";
import { GolfwingGrid } from "./golfwing-grid";
import { deleteDispatch } from "../actions";
import { BillingYmCell } from "./billing-ym-cell";

export const dynamic = "force-dynamic";

export default async function DispatchesPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();

  const [rows, masters, monthCounts] = await Promise.all([
    getDispatches(actor.companyId, ym),
    getMasters(actor.companyId),
    getMonthCounts(actor.companyId),
  ]);
  const s = summarize(rows, ym);
  const staffTransport = byStaff(rows).filter((x) => x.transport > 0);
  const staffTransportTotal = staffTransport.reduce((a, x) => a + x.transport, 0);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">派遣台帳</h1>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="ym"
            defaultValue={ym}
            className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">表示</button>
        </form>
      </header>

      <MonthNav base="/dispatches" ym={ym} counts={monthCounts} />

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        <span className="text-(--color-dim)">色＝ゴルフ場</span>
        {masters.clients.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${clientTone(c.id, c.name).dot}`} />
            {c.name}
          </span>
        ))}
        <span className="ml-2 text-(--color-dim)">形＝状態</span>
        <span className="inline-block rounded border border-slate-400 bg-slate-100 px-1.5 leading-4">確定</span>
        <span className="inline-block rounded border border-dashed border-slate-400 bg-white px-1.5 leading-4">仮</span>
      </div>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">派遣をまとめて登録</h2>
        <p className="mb-3 text-xs text-(--color-dim)">
          日付は表示中の月（{ym.replace("-", "/")}）以外も入れられます。別の月で登録すると、
          その月に切り替えるまで下の一覧には出ません。
        </p>
        <BulkGrid
          clients={masters.clients}
          partners={masters.partners}
          staff={masters.staff}
          transportRates={masters.transportRates}
          defaultDate={`${ym}-01`}
        />
      </section>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-1 font-semibold">ゴルフウィング勤務（時給）</h2>
        <p className="mb-3 text-xs text-(--color-dim)">
          キャディが自社ゴルフウィングに出勤した分。ゴルフウィングへの請求書は作らず、キャディ→YOZAN請求書に合算します
        </p>
        <GolfwingGrid partners={masters.partners} defaultDate={`${ym}-01`} />
      </section>

      {staffTransport.length > 0 ? (
        <section className={`${cardCls} mb-6`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">従業員の交通費（給与で精算）</h2>
            <p className="text-sm">
              合計 <b className="tabular-nums">{yen(staffTransportTotal)}</b>
            </p>
          </div>
          <p className="mb-3 text-xs text-(--color-dim)">
            社員がキャディに入った分の交通費です。外注費には計上せず、この金額を給与（Shift Cloud）側で精算してください（二重計上防止）。
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-(--color-dim)">
              <tr>
                <th className="pb-2">従業員</th>
                <th className="pb-2 text-right">回数</th>
                <th className="pb-2 text-right">交通費</th>
              </tr>
            </thead>
            <tbody>
              {staffTransport.map((s2) => (
                <tr key={s2.name} className="border-t border-(--color-line)">
                  <td className="py-1.5">{s2.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{s2.count}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{yen(s2.transport)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className={cardCls}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">
            {ym} の派遣（{rows.length}件）
          </h2>
          <p className="text-sm text-(--color-dim)">
            売上 {yen(s.sales)} / 外注費 {yen(s.outsourcing)} / 粗利{" "}
            <b className={s.gross >= 0 ? "text-emerald-700" : "text-red-600"}>{yen(s.gross)}</b>
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-(--color-dim)">
            この月の派遣はまだありません（上の「登録のある月」から他の月を開けます）
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-(--color-dim)">
                <tr>
                  <th className="pb-2">日付</th>
                  <th className="pb-2">取引先</th>
                  <th className="pb-2 text-right">売上</th>
                  <th className="pb-2">担当</th>
                  <th className="pb-2 text-right">委託料</th>
                  <th className="pb-2 text-right">交通費</th>
                  <th className="pb-2 text-right">手当</th>
                  <th className="pb-2 text-right">粗利</th>
                  <th className="pb-2">請求月</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cost = dispatchCost(r);
                  const gross = r.sales_amount - cost;
                  const isStaff = !!r.staff_id;
                  const isGw = r.kind === "golfwing";
                  return (
                    <tr key={r.id} className="border-t border-(--color-line)">
                      <td className="py-1.5 whitespace-nowrap">{r.dispatch_date.slice(5)}</td>
                      <td className="py-1.5">
                        {isGw ? (
                          <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">ゴルフウィング</span>
                        ) : r.cad_clients?.name ? (
                          <span
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${dispatchChipCls(
                              r.client_id,
                              r.status,
                              r.cad_clients.name
                            )}`}
                          >
                            <span className={`inline-block h-2 w-2 rounded-sm ${clientTone(r.client_id, r.cad_clients.name).dot}`} />
                            {r.cad_clients.name}
                            {r.status === "tentative" ? <span className="font-medium">・仮</span> : null}
                          </span>
                        ) : (
                          <span className="text-(--color-dim)">—</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.sales_amount > 0 ? yen(r.sales_amount) : "—"}
                      </td>
                      <td className="py-1.5">
                        {isStaff ? (
                          <span>
                            {r.staff?.name}
                            <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-800">自社</span>
                          </span>
                        ) : (
                          (r.cad_partners?.name ?? <span className="text-(--color-dim)">—</span>)
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {isStaff ? "—" : yen(r.fee_amount)}
                        {isGw && r.work_hours ? (
                          <span className="ml-1 text-[10px] text-(--color-dim)">{r.work_hours}h</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.transport_amount > 0 ? yen(r.transport_amount) : "—"}
                        {isStaff && r.transport_amount > 0 ? (
                          <span className="ml-1 text-[10px] text-(--color-dim)">給与精算</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.special_amount > 0 ? yen(r.special_amount) : "—"}
                      </td>
                      <td
                        className={`py-1.5 text-right font-medium tabular-nums ${!isGw && gross < 0 ? "text-red-600" : ""}`}
                      >
                        {isGw ? <span className="text-(--color-dim)">—</span> : yen(gross)}
                      </td>
                      <td className="py-1.5">
                        {r.sales_amount > 0 ? <BillingYmCell id={r.id} value={r.billing_ym} /> : <span className="text-(--color-dim)">—</span>}
                      </td>
                      <td className="py-1.5 text-right">
                        <form action={deleteDispatch}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="ym" value={ym} />
                          <button className="text-xs text-(--color-dim) hover:text-red-600">削除</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
