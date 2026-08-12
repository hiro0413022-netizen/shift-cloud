import Link from "next/link";
import { requireInventoryActor } from "@/lib/auth";
import { listStock, yen, storeScopeOf, scopeLabel } from "@/lib/inventory";
import { Panel, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; all?: string }>;
}) {
  const sp = await searchParams;
  const actor = await requireInventoryActor();
  // 品番マスタも自店舗だけ（#134）
  const all = await listStock(actor.companyId, { scope: storeScopeOf(actor), includeDiscontinued: true });

  const categories = [...new Set(all.map((r) => r.category))].sort();
  const term = (sp.q ?? "").trim().toLowerCase();

  const rows = all.filter((r) => {
    if (!sp.all && r.status === "discontinued") return false;
    if (sp.cat && r.category !== sp.cat) return false;
    if (term && !`${r.code} ${r.name} ${r.maker} ${r.variant ?? ""}`.toLowerCase().includes(term)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            品番マスタ
            <Badge tone={actor.isOwner ? "ok" : "default"}>{scopeLabel(actor)}</Badge>
          </h1>
          <p className="text-sm text-(--color-dim)">
            管理番号は「品目略号-メーカー略号-連番」。採番はシステムが行います
          </p>
        </div>
        {actor.canManage && (
          <Link href="/items/new" className="rounded-lg bg-(--color-accent) px-4 py-2.5 text-sm font-bold text-black">
            新しい品番を登録
          </Link>
        )}
      </header>

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="管理番号・商品名・メーカーで探す"
          className="min-w-0 flex-1 rounded-lg border border-(--color-line) bg-(--color-panel) px-4 py-2.5 outline-none focus:border-(--color-accent)"
        />
        <select
          name="cat"
          defaultValue={sp.cat ?? ""}
          className="rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2.5 text-sm"
        >
          <option value="">すべての品目</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-(--color-dim)">
          <input type="checkbox" name="all" value="1" defaultChecked={!!sp.all} />
          廃番も表示
        </label>
        <button className="rounded-lg border border-(--color-line) px-4 py-2.5 text-sm">絞り込む</button>
      </form>

      <Panel title={`${rows.length}件`}>
        {rows.length === 0 ? (
          <Empty>該当する品番がありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="py-2 pr-3 font-normal">管理番号</th>
                  <th className="py-2 pr-3 font-normal">商品名</th>
                  <th className="py-2 pr-3 font-normal">メーカー</th>
                  <th className="py-2 pr-3 font-normal">保管場所</th>
                  <th className="py-2 pr-3 text-right font-normal">在庫</th>
                  <th className="py-2 pr-3 text-right font-normal">仕入単価</th>
                  <th className="py-2 text-right font-normal">在庫金額</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.item_id} className="border-b border-(--color-line)/50">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Link href={`/items/${r.item_id}`} className="text-(--color-accent)">
                        {r.code}
                      </Link>
                      {r.status === "discontinued" && (
                        <span className="ml-2">
                          <Badge>廃番</Badge>
                        </span>
                      )}
                    </td>
                    <td className="max-w-[22rem] truncate py-2 pr-3">
                      {r.name}
                      {r.variant && <span className="ml-1 text-(--color-dim)">/ {r.variant}</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-(--color-dim)">{r.maker}</td>
                    <td className="max-w-[12rem] truncate py-2 pr-3 text-(--color-dim)">{r.location1 ?? "—"}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${r.qty === 0 ? "text-(--color-dim)" : ""}`}>
                      {r.qty}
                      <span className="ml-0.5 text-xs text-(--color-dim)">{r.unit}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-(--color-dim)">{yen(r.cost_price)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(r.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm font-bold">
                  <td colSpan={4} className="py-2 text-right text-(--color-dim)">
                    合計
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{rows.reduce((s, r) => s + r.qty, 0)}</td>
                  <td />
                  <td className="py-2 text-right tabular-nums">{yen(rows.reduce((s, r) => s + r.value, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
