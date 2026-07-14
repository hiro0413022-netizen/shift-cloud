import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Empty, Badge, yen, btnCls } from "@/components/ui";

export const dynamic = "force-dynamic";

type Txn = { txn_date: string; amount: number; status: string };

export default async function DashboardPage() {
  const actor = await requireMoneyActor();
  const admin = createAdmin();

  const { data: txns } = await admin
    .from("mon_bank_txn")
    .select("txn_date, amount, status")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);

  const all = (txns ?? []) as Txn[];
  const unassigned = all.filter((t) => t.status === "unassigned").length;

  // 確定済み経費（出金）を月別に集計
  const byMonth = new Map<string, number>();
  for (const t of all) {
    if (t.status !== "confirmed" || t.amount >= 0) continue;
    const m = t.txn_date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + Math.abs(t.amount));
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">お金管理 ダッシュボード</h1>
          <p className="text-sm text-(--color-dim)">GOLF WING の売上・現金・経費を一元管理（Money OS）</p>
        </div>
        <Link href="/import" className={btnCls}>カード・口座を取込</Link>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel title="未仕分けの明細">
          <p className="text-3xl font-bold tabular-nums">{unassigned}</p>
          <p className="mt-1 text-sm text-(--color-dim)">
            {unassigned > 0 ? <Link href="/import" className="text-(--color-gold) hover:underline">仕分けする →</Link> : "すべて仕分け済み"}
          </p>
        </Panel>
        <Panel title="取込済み明細（合計）" className="sm:col-span-2">
          <p className="text-3xl font-bold tabular-nums">{all.length}</p>
          <p className="mt-1 text-sm text-(--color-dim)">確定 {all.filter((t) => t.status === "confirmed").length} / 除外 {all.filter((t) => t.status === "ignored").length}</p>
        </Panel>
      </div>

      <Panel title="月別 確定経費（カード・口座）">
        {months.length === 0 ? (
          <Empty>まだ確定済みの経費がありません。取込 → 仕分けで反映されます</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {months.map(([m, v]) => (
              <li key={m} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2"><Badge tone="gold">{m}</Badge></span>
                <span className="tabular-nums">{yen(-v)} 円</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-(--color-dim)">
        ※ 確定した経費は財務(fin_entries)へ自動集約され、GENESISの営業利益KPIに反映されます。
      </p>
    </div>
  );
}
