import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, latestCashBalance } from "@/lib/money";
import { categorySales } from "@/lib/analytics";
import { Panel, Empty, Badge, yen, btnCls, btnGhostCls } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * お金管理 ダッシュボード
 *
 * 店舗スコープ（#134 / DECISIONS #128「店舗またぎ廃止」）:
 *   ここが読む mon_bank_txn は法人カード・法人口座の明細で、実際には店舗が入っていない
 *   （store_id 列は 0023 で足したが、/import の取込は今も入れていない＝全部 null）。
 *   つまり「店舗で絞って現場に見せる」ことが原理的にできない全社の数字なので、
 *   同じデータを扱う /import（requireManageAll）と権限を揃えてオーナー限定にする。
 *   現場アカウントには、店舗で絞れる数字（自店舗の現金残高・今月の店頭売上）だけを出す。
 */

type Txn = { txn_date: string; amount: number; status: string };

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);

  // ---- 現場アカウント: 自店舗の数字だけ ----
  if (!actor.canManageAll) {
    const month = ym(new Date());
    const [balance, cats] = await Promise.all([
      store ? latestCashBalance(actor.companyId, store.id) : Promise.resolve(0),
      store ? categorySales(actor.companyId, store.id, month) : Promise.resolve([]),
    ]);
    const total = cats.reduce((a, c) => a + c.amount, 0);

    return (
      <div className="space-y-4">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            お金管理 ダッシュボード
            <Badge tone="gold">{store?.name ?? "店舗未選択"}</Badge>
          </h1>
          <p className="text-sm text-(--color-dim)">自店舗の売上・現金を管理します</p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Panel title="現金残高（自店舗）">
            <p className="text-3xl font-bold tabular-nums">{yen(balance)} 円</p>
            <p className="mt-1 text-sm text-(--color-dim)">
              <Link href="/cash" className="text-(--color-gold) hover:underline">現金出納へ →</Link>
            </p>
          </Panel>
          <Panel title={`今月の店頭売上（${month}）`}>
            <p className="text-3xl font-bold tabular-nums">{yen(total)} 円</p>
            <p className="mt-1 text-sm text-(--color-dim)">
              <Link href="/analysis" className="text-(--color-gold) hover:underline">売上分析へ →</Link>
            </p>
          </Panel>
        </div>

        <Panel title="今月のカテゴリ別">
          {cats.length === 0 ? (
            <Empty>まだ今月の売上がありません。売上入力から記録してください</Empty>
          ) : (
            <ul className="divide-y divide-(--color-line)">
              {cats.slice(0, 10).map((c) => (
                <li key={c.name} className="flex items-center justify-between py-2 text-sm">
                  <span>{c.name}</span>
                  <span className="tabular-nums">{yen(c.amount)} 円</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-wrap gap-2">
          <Link href="/sales" className={btnCls}>売上を入力</Link>
          <Link href="/count" className={btnGhostCls}>金種棚卸</Link>
          <Link href="/receipts" className={btnGhostCls}>証憑</Link>
        </div>

        <p className="text-xs text-(--color-dim)">
          ※ カード・口座の明細（全社）はオーナーのみが扱います（#134）。
        </p>
      </div>
    );
  }

  // ---- オーナー: 全社のカード・口座明細 ----
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
          <h1 className="flex items-center gap-2 text-xl font-bold">
            お金管理 ダッシュボード
            {/* 全社の数字であることを明示する（#134） */}
            <Badge tone="ok">全社</Badge>
          </h1>
          <p className="text-sm text-(--color-dim)">カード・口座（法人）の明細は店舗に紐づかないため全社合計です</p>
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
