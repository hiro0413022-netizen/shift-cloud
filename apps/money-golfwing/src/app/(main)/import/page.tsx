import { requireManageAll } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Empty, Badge, yen, inputCls, btnGhostCls, btnCls } from "@/components/ui";
import { PageHeader } from "@/components/ui";
import { Uploader } from "./uploader";
import { confirmTxn, ignoreTxn } from "./actions";
import { proposeCategory } from "@/lib/import/categorize";
import { SettlementPanel } from "./settlement-panel";
import type { ExpenseRow, TxnRow } from "@/lib/settlement";

export const dynamic = "force-dynamic";

/** 消込の対象にする期間（発生・支払とも直近このぶんだけ見る）。全期間を舐めない */
const SETTLE_LOOKBACK_DAYS = 400;

type Seg = { id: string; name: string; code: string };
type Cat = { code: string; name: string; kind: string };
type Txn = { id: string; txn_date: string; description: string; amount: number; balance: number | null };

export default async function ImportPage() {
  const actor = await requireManageAll();
  const admin = createAdmin();

  const since = new Date(Date.now() - SETTLE_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

  const [
    { data: sources },
    { data: segments },
    { data: categories },
    { data: txns },
    { data: expenseRows },
    { data: settleTxnRows },
  ] = await Promise.all([
    admin.from("mon_bank_source").select("code, name").eq("company_id", actor.companyId).is("deleted_at", null).order("code"),
    admin.from("fin_segments").select("id, name, code").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("fin_categories").select("code, name, kind").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("mon_bank_txn").select("id, txn_date, description, amount, balance")
      .eq("company_id", actor.companyId).eq("status", "unassigned").is("deleted_at", null)
      .order("txn_date", { ascending: false }).limit(100),
    // 消込パネル用: 直近の経費（発生）と 確定済みの出金（支払）
    admin.from("mon_expense").select("id, spent_on, item, payee, category, amount, settled_txn_id")
      .eq("company_id", actor.companyId).is("deleted_at", null).gte("spent_on", since)
      .order("spent_on", { ascending: false }),
    admin.from("mon_bank_txn").select("id, txn_date, description, amount")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .eq("status", "confirmed").lt("amount", 0).gte("txn_date", since)
      .order("txn_date", { ascending: false }),
  ]);

  const segs = (segments ?? []) as Seg[];
  const cats = (categories ?? []).filter((c: Cat) => c.kind !== "revenue") as Cat[];
  const rows = (txns ?? []) as Txn[];
  const expenses = (expenseRows ?? []) as ExpenseRow[];
  const settleTxns = (settleTxnRows ?? []) as TxnRow[];
  const hqId = segs.find((s) => s.code === "hq")?.id ?? segs[0]?.id ?? "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="カード・口座の取込"
        lead="法人カード（AMEX）・口座（尼崎信金）の明細ファイル（CSV）を読み込み、1件ずつ「どの事業の・何の費用か」を振り分けて確定します。確定した分は会社の損益に自動で入ります（オーナーのみ）。"
      />

      <Panel title="① 明細ファイルを読み込む" hint="カード会社・銀行のサイトからダウンロードしたCSVを選んでください">
        <Uploader sources={(sources ?? []) as { code: string; name: string }[]} />
      </Panel>

      <SettlementPanel expenses={expenses} txns={settleTxns} />

      <Panel title={`② 振り分けが済んでいない明細（${rows.length}件）`} hint="事業と科目を選んで「確定」。会社の経費でないもの（口座間の移動など）は「対象外」">
        {rows.length === 0 ? (
          <Empty>未仕分けの明細はありません。CSVを取込むとここに並びます</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                  <th className="py-2 pr-2 text-left font-medium">日付</th>
                  <th className="px-2 py-2 text-left font-medium">摘要</th>
                  <th className="px-2 py-2 text-right font-medium">金額</th>
                  <th className="px-2 py-2 text-left font-medium">事業 / 科目</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const proposed = proposeCategory(t.description);
                  const isExpense = t.amount < 0;
                  return (
                    <tr key={t.id} className="border-b border-(--color-line) align-middle">
                      <td className="py-2 pr-2 tabular-nums text-(--color-dim)">{t.txn_date}</td>
                      <td className="px-2 py-2">{t.description || "—"}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${isExpense ? "" : "text-(--color-ok)"}`}>{yen(t.amount)}</td>
                      <td className="px-2 py-2">
                        <form action={confirmTxn} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={t.id} />
                          <select name="segment_id" defaultValue={hqId} className={inputCls} style={{ maxWidth: 150 }}>
                            {segs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <select name="category" defaultValue={proposed} className={inputCls} style={{ maxWidth: 150 }}>
                            {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                          </select>
                          <button className={btnCls}>確定</button>
                        </form>
                      </td>
                      <td className="px-2 py-2">
                        {isExpense ? <Badge tone="dim">経費候補</Badge> : <Badge tone="ok">入金</Badge>}
                        <form action={ignoreTxn} className="mt-1">
                          <input type="hidden" name="id" value={t.id} />
                          <button className="rounded-md border border-(--color-line) px-3 py-1.5 text-sm text-(--color-dim) hover:border-(--color-accent) hover:text-(--color-accent)">対象外</button>
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
