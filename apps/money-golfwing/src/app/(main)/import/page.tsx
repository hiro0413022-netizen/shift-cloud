import { requireManageAll } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Empty, Badge, yen, inputCls, btnGhostCls } from "@/components/ui";
import { Uploader } from "./uploader";
import { confirmTxn, ignoreTxn } from "./actions";
import { proposeCategory } from "@/lib/import/categorize";

export const dynamic = "force-dynamic";

type Seg = { id: string; name: string; code: string };
type Cat = { code: string; name: string; kind: string };
type Txn = { id: string; txn_date: string; description: string; amount: number; balance: number | null };

export default async function ImportPage() {
  const actor = await requireManageAll();
  const admin = createAdmin();

  const [{ data: sources }, { data: segments }, { data: categories }, { data: txns }] = await Promise.all([
    admin.from("mon_bank_source").select("code, name").eq("company_id", actor.companyId).is("deleted_at", null).order("code"),
    admin.from("fin_segments").select("id, name, code").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("fin_categories").select("code, name, kind").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("mon_bank_txn").select("id, txn_date, description, amount, balance")
      .eq("company_id", actor.companyId).eq("status", "unassigned").is("deleted_at", null)
      .order("txn_date", { ascending: false }).limit(100),
  ]);

  const segs = (segments ?? []) as Seg[];
  const cats = (categories ?? []).filter((c: Cat) => c.kind !== "revenue") as Cat[];
  const rows = (txns ?? []) as Txn[];
  const hqId = segs.find((s) => s.code === "hq")?.id ?? segs[0]?.id ?? "";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">カード・口座取込</h1>
        <p className="text-sm text-[--color-dim]">AMEX・尼崎信金のCSVを取込 → 事業・科目を割当てて確定 → 経費KPIへ自動反映</p>
      </header>

      <Panel title="CSVアップロード">
        <Uploader sources={(sources ?? []) as { code: string; name: string }[]} />
      </Panel>

      <Panel title={`未仕分けの明細（${rows.length}件）`}>
        {rows.length === 0 ? (
          <Empty>未仕分けの明細はありません。CSVを取込むとここに並びます</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--color-line] text-xs text-[--color-dim]">
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
                    <tr key={t.id} className="border-b border-[--color-line] align-middle">
                      <td className="py-2 pr-2 tabular-nums text-[--color-dim]">{t.txn_date}</td>
                      <td className="px-2 py-2">{t.description || "—"}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${isExpense ? "" : "text-[--color-ok]"}`}>{yen(t.amount)}</td>
                      <td className="px-2 py-2">
                        <form action={confirmTxn} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={t.id} />
                          <select name="segment_id" defaultValue={hqId} className={inputCls} style={{ maxWidth: 150 }}>
                            {segs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <select name="category" defaultValue={proposed} className={inputCls} style={{ maxWidth: 150 }}>
                            {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                          </select>
                          <button className={btnGhostCls}>確定</button>
                        </form>
                      </td>
                      <td className="px-2 py-2">
                        {isExpense ? <Badge tone="dim">経費候補</Badge> : <Badge tone="ok">入金</Badge>}
                        <form action={ignoreTxn} className="mt-1">
                          <input type="hidden" name="id" value={t.id} />
                          <button className="text-xs text-[--color-dim] hover:text-[--color-accent]">除外</button>
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
