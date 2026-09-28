import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, latestCashBalance } from "@/lib/money";
import { Panel, Empty, Badge, yen, PageHeader, SubTabs, CASH_TABS } from "@/components/ui";
import CountForm from "./CountForm";
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
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // JST（UTCだと朝9時まで前日になる）

  return (
    <div className="space-y-5">
      <PageHeader
        title="レジのお金"
        store={store?.name ?? "店舗未選択"}
        lead="閉店のときにレジのお金を数えて、帳簿と合っているかを確かめます（経理では「金種棚卸」と呼びます）。"
      />
      <SubTabs items={CASH_TABS} current="count" />

      <Panel title="レジ締め（お金を数える）">
        {!store ? (
          <Empty>店舗が選択されていません。メニューの店舗から選んでください</Empty>
        ) : (
          <CountForm action={addCount} today={today} theoretical={theoretical} />
        )}
      </Panel>

      <Panel title="これまでのレジ締め">
        {rows.length === 0 ? (
          <Empty>まだレジ締めの記録がありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                  <th className="py-2 pr-2 text-left font-medium">日時</th>
                  <th className="px-2 py-2 text-left font-medium">場所</th>
                  <th className="px-2 py-2 text-right font-medium">数えた合計</th>
                  <th className="px-2 py-2 text-right font-medium">帳簿の金額</th>
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
                        {diff === 0 ? <Badge tone="ok">ぴったり</Badge> : <Badge tone="accent">{diff > 0 ? "+" : ""}{yen(diff)}</Badge>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <form action={deleteCount}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-(--color-accent) hover:bg-red-50">消す</button>
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
