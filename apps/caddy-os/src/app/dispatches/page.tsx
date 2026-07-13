import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { getDispatches, getMasters, summarize, currentYm, yen, dispatchCost } from "@/lib/caddy";
import { BulkGrid } from "./bulk-grid";
import { deleteDispatch } from "../actions";

export const dynamic = "force-dynamic";

export default async function DispatchesPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();

  const [rows, masters] = await Promise.all([getDispatches(actor.companyId, ym), getMasters(actor.companyId)]);
  const s = summarize(rows, ym);

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

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">派遣をまとめて登録</h2>
        <BulkGrid
          clients={masters.clients}
          partners={masters.partners}
          staff={masters.staff}
          defaultDate={`${ym}-01`}
        />
      </section>

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
          <p className="text-sm text-(--color-dim)">この月の派遣はまだありません</p>
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
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cost = dispatchCost(r);
                  const gross = r.sales_amount - cost;
                  const isStaff = !!r.staff_id;
                  return (
                    <tr key={r.id} className="border-t border-(--color-line)">
                      <td className="py-1.5 whitespace-nowrap">{r.dispatch_date.slice(5)}</td>
                      <td className="py-1.5">{r.cad_clients?.name ?? <span className="text-(--color-dim)">—</span>}</td>
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
                      <td className="py-1.5 text-right tabular-nums">{isStaff ? "—" : yen(r.fee_amount)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.transport_amount > 0 ? yen(r.transport_amount) : "—"}
                        {isStaff && r.transport_amount > 0 ? (
                          <span className="ml-1 text-[10px] text-(--color-dim)">給与</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.special_amount > 0 ? yen(r.special_amount) : "—"}
                      </td>
                      <td
                        className={`py-1.5 text-right font-medium tabular-nums ${gross < 0 ? "text-red-600" : ""}`}
                      >
                        {yen(gross)}
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
