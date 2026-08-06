import { Panel, Empty, Badge, yen, inputCls, btnGhostCls } from "@/components/ui";
import { settleExpense, unsettleExpense } from "./actions";
import {
  suggestTxnsForExpense,
  usedTxnIdSet,
  type ExpenseRow,
  type TxnRow,
} from "@/lib/settlement";

/**
 * 支払の消込（DECISIONS #108）。
 * PLの経費は「発生（mon_expense）＋確定出金（mon_bank_txn）」の足し算なので、
 * 同じ支払が両方に入ると二重計上になる。ここで結ぶと集計側が出金から差し引く。
 */
export function SettlementPanel({
  expenses,
  txns,
}: {
  expenses: ExpenseRow[];
  txns: TxnRow[];
}) {
  const used = usedTxnIdSet(expenses);
  const txnById = new Map(txns.map((t) => [t.id, t]));

  const settled = expenses.filter((e) => e.settled_txn_id);
  // 候補が1件も無い経費は並べても押せないので隠す（現金払い・未払いのものが大半）
  const pending = expenses
    .filter((e) => !e.settled_txn_id)
    .map((e) => ({ e, suggestions: suggestTxnsForExpense(e, txns, used) }))
    .filter((x) => x.suggestions.length > 0);

  return (
    <Panel title={`支払の消込（候補あり ${pending.length}件 / 消込済 ${settled.length}件）`}>
      <p className="mb-3 text-xs text-(--color-dim)">
        経費（発生）と口座・カードの出金（支払）が<b>同じ支払</b>なら、ここで結んでください。
        結ぶとPLの計算で出金側からその分が差し引かれ、<b>二重計上になりません</b>。結び直し・解除はいつでもできます。
      </p>

      {pending.length === 0 ? (
        <Empty>突合できそうな組み合わせはありません</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                <th className="py-2 pr-2 text-left font-medium">発生日</th>
                <th className="px-2 py-2 text-left font-medium">経費</th>
                <th className="px-2 py-2 text-right font-medium">金額</th>
                <th className="px-2 py-2 text-left font-medium">支払（候補）</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map(({ e, suggestions }) => (
                <tr key={e.id} className="border-b border-(--color-line) align-middle">
                  <td className="py-2 pr-2 tabular-nums text-(--color-dim)">{e.spent_on}</td>
                  <td className="px-2 py-2">
                    <span className="font-medium">{e.item || e.category || "経費"}</span>
                    {e.payee ? <span className="ml-1 text-(--color-dim)">/ {e.payee}</span> : null}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{yen(e.amount)}</td>
                  <td className="px-2 py-2">
                    <form action={settleExpense} className="flex items-center gap-2">
                      <input type="hidden" name="expense_id" value={e.id} />
                      <select name="txn_id" className={inputCls} style={{ maxWidth: 320 }}>
                        {suggestions.map((s) => (
                          <option key={s.txn.id} value={s.txn.id}>
                            {s.txn.txn_date}／{yen(Math.abs(s.txn.amount))}／
                            {(s.txn.description || "").slice(0, 20)}（{s.reason}）
                          </option>
                        ))}
                      </select>
                      <button className={btnGhostCls}>消込</button>
                    </form>
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone={suggestions[0].reason === "金額・支払先が一致" ? "ok" : "dim"}>
                      {suggestions[0].reason}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {settled.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-(--color-dim)">消込済み</p>
          <ul className="space-y-1 text-sm">
            {settled.map((e) => {
              const t = e.settled_txn_id ? txnById.get(e.settled_txn_id) : undefined;
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone="ok">消込済</Badge>
                  <span>
                    {e.spent_on}／{e.item || e.category}／{yen(e.amount)}
                  </span>
                  <span className="text-(--color-dim)">
                    ↔ {t ? `${t.txn_date}／${(t.description || "").slice(0, 24)}` : "（対象の明細が見つかりません）"}
                  </span>
                  <form action={unsettleExpense}>
                    <input type="hidden" name="expense_id" value={e.id} />
                    <button className="text-xs text-(--color-dim) hover:text-(--color-accent)">解除</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
