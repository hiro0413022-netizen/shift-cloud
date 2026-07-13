import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, monthRange } from "@/lib/money";
import { Panel, Empty, yen, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { addSale, deleteSale } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["利用料", "月会費", "販売", "その他"];
const PAY_METHODS = ["現金", "Airペイ", "SBペイメント", "楽天ペイ", "振込", "その他"];

type Sale = {
  id: string; sold_on: string; category: string; customer_name: string | null;
  member_kind: string | null; amount: number; tax_included: number | null;
  pay_method: string | null; memo: string | null; detail: Record<string, unknown>;
};

function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function shift(y: string, n: number) { const [a, m] = y.split("-").map(Number); return ym(new Date(a, m - 1 + n, 1)); }

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : ym(new Date());
  const { from, to } = monthRange(month);

  const { data } = store
    ? await admin.from("mon_sales").select("*")
        .eq("company_id", actor.companyId).eq("store_id", store.id)
        .gte("sold_on", from).lt("sold_on", to).is("deleted_at", null)
        .order("sold_on", { ascending: false })
    : { data: [] };
  const rows = (data ?? []) as Sale[];
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">売上 — {store?.name ?? "店舗未選択"}</h1>
          <p className="text-sm text-(--color-dim)">日々の売上を入力。現金はそのまま現金出納にも反映されます</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/sales?month=${shift(month, -1)}`} className={btnGhostCls}>← 前月</Link>
          <span className="min-w-24 text-center font-bold tabular-nums">{month}</span>
          <Link href={`/sales?month=${shift(month, 1)}`} className={btnGhostCls}>翌月 →</Link>
        </div>
      </header>

      <Panel title={`当月売上合計（税抜）`}>
        <p className="text-3xl font-bold tabular-nums">{yen(total)} 円</p>
        <p className="mt-1 text-sm text-(--color-dim)">{rows.length} 件</p>
      </Panel>

      <Panel title="売上を追加">
        {!store ? (
          <Empty>店舗が選択されていません。上部の店舗切替で選んでください</Empty>
        ) : (
          <form action={addSale} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input type="date" name="sold_on" defaultValue={today} className={inputCls} required />
            <select name="category" className={inputCls} defaultValue="利用料">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input name="product_name" placeholder="品名・内容" className={inputCls} />
            <input name="customer_name" placeholder="お客様名" className={inputCls} />
            <input name="amount" inputMode="numeric" placeholder="金額(税抜)" className={inputCls} required />
            <input name="tax_included" inputMode="numeric" placeholder="税込(任意)" className={inputCls} />
            <input name="qty" inputMode="numeric" placeholder="個数(任意)" className={inputCls} />
            <select name="pay_method" className={inputCls} defaultValue="現金">
              {PAY_METHODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select name="member_kind" className={inputCls} defaultValue="">
              <option value="">会員区分</option>
              <option value="会員">会員</option>
              <option value="ビジター">ビジター</option>
            </select>
            <input name="memo" placeholder="備考" className={`${inputCls} sm:col-span-2`} />
            <button className={`${btnCls} justify-center`}>追加</button>
          </form>
        )}
      </Panel>

      <Panel title={`明細（${month}）`}>
        {rows.length === 0 ? (
          <Empty>この月の売上はまだありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                  <th className="py-2 pr-2 text-left font-medium">日付</th>
                  <th className="px-2 py-2 text-left font-medium">区分</th>
                  <th className="px-2 py-2 text-left font-medium">品名/お客様</th>
                  <th className="px-2 py-2 text-right font-medium">金額</th>
                  <th className="px-2 py-2 text-left font-medium">支払</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-(--color-line)">
                    <td className="py-2 pr-2 tabular-nums text-(--color-dim)">{r.sold_on}</td>
                    <td className="px-2 py-2">{r.category}</td>
                    <td className="px-2 py-2">{String(r.detail?.product_name ?? "") || r.customer_name || "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{yen(Number(r.amount))}</td>
                    <td className="px-2 py-2 text-(--color-dim)">{r.pay_method ?? "—"}</td>
                    <td className="px-2 py-2 text-right">
                      <form action={deleteSale}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="text-xs text-(--color-dim) hover:text-(--color-accent)">削除</button>
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
