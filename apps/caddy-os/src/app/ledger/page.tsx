import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, getDispatches, isBillable, yen } from "@/lib/caddy";

export const dynamic = "force-dynamic";

/**
 * キャディ台帳（DECISIONS #140）
 *
 * 「確定を押したら台帳に載る」を、別テーブルへのコピーではなく **同じ行の別の見え方** で実現している。
 * 台帳テーブルを作って同期させる設計は、必ずどこかでズレる（Excel運用がまさにそれだった）。
 */
export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();

  const admin = createAdmin();
  const [rows, { data: partners }] = await Promise.all([
    getDispatches(actor.companyId, ym),
    admin
      .from("cad_partners")
      .select("id, code, name, status")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("code"),
  ]);

  const ps = (partners ?? []) as Array<{ id: string; code: string | null; name: string; status: string }>;

  type Agg = { days: Set<string>; count: number; fee: number; transport: number; special: number; tentative: number };
  const agg = new Map<string, Agg>();
  for (const r of rows) {
    if (!r.partner_id) continue;
    const cur = agg.get(r.partner_id) ?? { days: new Set<string>(), count: 0, fee: 0, transport: 0, special: 0, tentative: 0 };
    if (r.status === "tentative") cur.tentative += 1;
    if (isBillable(r)) {
      cur.days.add(r.dispatch_date);
      cur.count += 1;
      cur.fee += r.fee_amount;
      cur.transport += r.transport_amount;
      cur.special += r.special_amount;
    }
    agg.set(r.partner_id, cur);
  }

  const list = ps
    .map((p) => ({ ...p, a: agg.get(p.id) }))
    .filter((p) => p.a || p.status === "active")
    .sort((a, b) => (b.a?.count ?? 0) - (a.a?.count ?? 0) || a.name.localeCompare(b.name, "ja"));

  const total = [...agg.values()].reduce(
    (t, a) => ({ count: t.count + a.count, pay: t.pay + a.fee + a.transport + a.special }),
    { count: 0, pay: 0 }
  );

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">キャディ台帳</h1>
          <p className="mt-1 text-sm text-(--color-dim)">
            確定した派遣がそのまま台帳になります（転記不要）。金額は確定分のみを合計しています。
          </p>
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

      <section className={cardCls}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">{ym} の勤務</h2>
          <p className="text-sm text-(--color-dim)">
            確定 {total.count} 件 / 支払計 <b className="tabular-nums">{yen(total.pay)}</b>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-(--color-dim)">
              <tr>
                <th className="pb-2">キャディ</th>
                <th className="pb-2 text-right">勤務日数</th>
                <th className="pb-2 text-right">確定件数</th>
                <th className="pb-2 text-right">委託料</th>
                <th className="pb-2 text-right">交通費</th>
                <th className="pb-2 text-right">手当</th>
                <th className="pb-2 text-right">支払計</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const a = p.a;
                const pay = a ? a.fee + a.transport + a.special : 0;
                return (
                  <tr key={p.id} className="border-t border-(--color-line)">
                    <td className="py-1.5">
                      <Link href={`/ledger/${p.id}?ym=${ym}`} className="underline">
                        {p.name}
                      </Link>
                      {p.status !== "active" ? (
                        <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">休止</span>
                      ) : null}
                      {a && a.tentative > 0 ? (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">仮{a.tentative}</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{a ? a.days.size : 0}</td>
                    <td className="py-1.5 text-right tabular-nums">{a ? a.count : 0}</td>
                    <td className="py-1.5 text-right tabular-nums">{a ? yen(a.fee) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{a ? yen(a.transport) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums">{a && a.special > 0 ? yen(a.special) : "—"}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{a ? yen(pay) : "—"}</td>
                    <td className="py-1.5 text-right">
                      <Link href={`/invoices/payable/${p.id}?ym=${ym}`} className="text-xs text-(--color-dim) underline">
                        支払請求書
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
