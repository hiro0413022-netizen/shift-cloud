import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, latestCashBalance, DENOMS } from "@/lib/money";
import { Panel, Empty, Badge, yen, inputCls, btnCls } from "@/components/ui";
import { addCount, deleteCount } from "./actions";

export const dynamic = "force-dynamic";

type Count = {
  id: string; counted_at: string; location: string; denominations: Record<string, number>;
  total: number; theoretical: number | null; diff: number | null; counted_by: string | null;
};

export default async function CountPage() {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);

  const { data } = store
    ? await admin.from("mon_cash_count").select("*")
        .eq("company_id", actor.companyId).eq("store_id", store.id).is("deleted_at", null)
        .order("counted_at", { ascending: false }).limit(30)
    : { data: [] };
  const rows = (data ?? []) as Count[];
  const theoretical = store ? await latestCashBalance(actor.companyId, store.id) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">金種棚卸 — {store?.name ?? "店舗未選択"}</h1>
        <p className="text-sm text-(--color-dim)">レジ・金庫の枚数を入力 → 合計を自動計算し、出納の理論残高と突合します</p>
      </header>

      <Panel title="出納帳の理論残高（現在）">
        <p className="text-3xl font-bold tabular-nums">{yen(theoretical)} 円</p>
        <p className="mt-1 text-sm text-(--color-dim)">棚卸の合計がこれと一致すればOK。差があれば差異として表示されます</p>
      </Panel>

      <Panel title="棚卸を記録">
        {!store ? (
          <Empty>店舗が選択されていません。上部の店舗切替で選んでください</Empty>
        ) : (
          <form action={addCount} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" name="counted_at" defaultValue={today} className={inputCls} style={{ maxWidth: 170 }} required />
              <select name="location" className={inputCls} defaultValue="register" style={{ maxWidth: 140 }}>
                <option value="register">レジ</option>
                <option value="safe">金庫</option>
              </select>
              <input name="memo" placeholder="備考" className={inputCls} style={{ maxWidth: 240 }} />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-9">
              {DENOMS.map((d) => (
                <label key={d} className="text-xs text-(--color-dim)">
                  {d.toLocaleString()}円
                  <input name={`d${d}`} inputMode="numeric" placeholder="0" className={`${inputCls} mt-1`} />
                </label>
              ))}
            </div>
            <button className={btnCls}>棚卸を保存</button>
          </form>
        )}
      </Panel>

      <Panel title="棚卸履歴">
        {rows.length === 0 ? (
          <Empty>まだ棚卸の記録がありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                  <th className="py-2 pr-2 text-left font-medium">日時</th>
                  <th className="px-2 py-2 text-left font-medium">場所</th>
                  <th className="px-2 py-2 text-right font-medium">カウント合計</th>
                  <th className="px-2 py-2 text-right font-medium">理論残高</th>
                  <th className="px-2 py-2 text-right font-medium">差異</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const diff = r.diff == null ? 0 : Number(r.diff);
                  return (
                    <tr key={r.id} className="border-b border-(--color-line)">
                      <td className="py-2 pr-2 tabular-nums text-(--color-dim)">{r.counted_at.slice(0, 10)}</td>
                      <td className="px-2 py-2">{r.location === "safe" ? "金庫" : "レジ"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{yen(Number(r.total))}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-(--color-dim)">{r.theoretical == null ? "—" : yen(Number(r.theoretical))}</td>
                      <td className="px-2 py-2 text-right">
                        {diff === 0 ? <Badge tone="ok">一致</Badge> : <Badge tone="accent">{yen(diff)}</Badge>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <form action={deleteCount}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="text-xs text-(--color-dim) hover:text-(--color-accent)">削除</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
