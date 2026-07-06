import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, latestCashBalance, monthRange } from "@/lib/money";
import { Panel, Empty, yen, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { addCashEntry, deleteCashEntry } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string; entry_date: string; summary: string | null; description: string | null;
  counterpart: string | null; in_amount: number; out_amount: number; balance: number | null; source: string;
};

function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function shift(y: string, n: number) { const [a, m] = y.split("-").map(Number); return ym(new Date(a, m - 1 + n, 1)); }

export default async function CashPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : ym(new Date());
  const { from, to } = monthRange(month);

  const { data } = store
    ? await admin.from("mon_cash_ledger").select("*")
        .eq("company_id", actor.companyId).eq("store_id", store.id)
        .gte("entry_date", from).lt("entry_date", to).is("deleted_at", null)
        .order("entry_date", { ascending: true }).order("created_at", { ascending: true })
    : { data: [] };
  const rows = (data ?? []) as Row[];
  const balance = store ? await latestCashBalance(actor.companyId, store.id) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">現金出納 — {store?.name ?? "店舗未選択"}</h1>
          <p className="text-sm text-[--color-dim]">入金・出金を入力すると残高が自動計算されます</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/cash?month=${shift(month, -1)}`} className={btnGhostCls}>← 前月</Link>
          <span className="min-w-24 text-center font-bold tabular-nums">{month}</span>
          <Link href={`/cash?month=${shift(month, 1)}`} className={btnGhostCls}>翌月 →</Link>
        </div>
      </header>

      <Panel title="現在の現金残高">
        <p className="text-3xl font-bold tabular-nums">{yen(balance)} 円</p>
      </Panel>

      <Panel title="出納を追加">
        {!store ? (
          <Empty>店舗が選択されていません。上部の店舗切替で選んでください</Empty>
        ) : (
          <form action={addCashEntry} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input type="date" name="entry_date" defaultValue={today} className={inputCls} required />
            <input name="summary" placeholder="摘要（利用料/返金/備品…）" className={inputCls} />
            <input name="description" placeholder="内容" className={inputCls} />
            <input name="counterpart" placeholder="相手・お客様" className={inputCls} />
            <input name="in_amount" inputMode="numeric" placeholder="入金" className={inputCls} />
            <input name="out_amount" inputMode="numeric" placeholder="出金" className={inputCls} />
            <input name="memo" placeholder="備考" className={inputCls} />
            <button className={`${btnCls} justify-center`}>追加</button>
          </form>
        )}
      </Panel>

      <Panel title={`出納帳（${month}）`}>
        {rows.length === 0 ? (
          <Empty>この月の記録はまだありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--color-line] text-xs text-[--color-dim]">
                  <th className="py-2 pr-2 text-left font-medium">日付</th>
                  <th className="px-2 py-2 text-left font-medium">摘要 / 内容</th>
                  <th className="px-2 py-2 text-right font-medium">入金</th>
                  <th className="px-2 py-2 text-right font-medium">出金</th>
                  <th className="px-2 py-2 text-right font-medium">残高</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[--color-line]">
                    <td className="py-2 pr-2 tabular-nums text-[--color-dim]">{r.entry_date}</td>
                    <td className="px-2 py-2">
                      {r.summary ?? "—"}{r.description ? ` / ${r.description}` : ""}
                      {r.source === "sales" && <span className="ml-1 text-xs text-[--color-gold]">売上</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[--color-ok]">{r.in_amount ? yen(Number(r.in_amount)) : ""}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.out_amount ? yen(Number(r.out_amount)) : ""}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{r.balance == null ? "—" : yen(Number(r.balance))}</td>
                    <td className="px-2 py-2 text-right">
                      <form action={deleteCashEntry}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-xs text-[--color-dim] hover:text-[--color-accent]">削除</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
