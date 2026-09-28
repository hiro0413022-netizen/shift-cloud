import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, latestCashBalance } from "@/lib/money";
import { categorySales } from "@/lib/analytics";
import { Panel, Empty, Badge, yen, btnCls, PageHeader } from "@/components/ui";
import { Icon } from "@/components/nav";

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


/** JSTの今日（UTCだと朝9時まで前日になる） */
function jstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 集計用の行（月次まるめ・移行）は「今日の入力」に数えない（売上画面と同じ扱い） */
const AGG_SOURCES = ["ledger", "migration", "slack_import"];

/**
 * 2026-09-28 ホームを「今日やること」に作り直し（ユーザー依頼「誰でも簡単にわかるUI」）
 *   開いた人がまず迷わないように、毎日の3つの作業を大きなボタンで出し、
 *   その横に「今日はもう済んだか」を出す（売上の件数・レジ締めの有無・精算待ち）。
 *   数字の見方（分析）は下に回す。
 */
export default async function DashboardPage() {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  const admin = createAdmin();
  const today = jstToday();
  const month = today.slice(0, 7);
  const nextDay = new Date(Date.parse(`${today}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);

  const [balance, cats, todaySales, todayCounts, openExp] = await Promise.all([
    store ? latestCashBalance(actor.companyId, store.id) : Promise.resolve(0),
    store ? categorySales(actor.companyId, store.id, month) : Promise.resolve([]),
    store
      ? admin.from("mon_sales").select("amount, source")
          .eq("company_id", actor.companyId).eq("store_id", store.id)
          .eq("sold_on", today).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    store
      ? admin.from("mon_cash_count").select("id, total, diff, location")
          .eq("company_id", actor.companyId).eq("store_id", store.id).is("deleted_at", null)
          .gte("counted_at", `${today}T00:00:00+09:00`).lt("counted_at", `${nextDay}T00:00:00+09:00`)
      : Promise.resolve({ data: [] }),
    admin.from("mon_expense").select("id, method, reimbursed_on")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .eq("source", "app").in("method", ["credit", "advance"]).is("settled_txn_id", null),
  ]);

  const sales = ((todaySales.data ?? []) as { amount: number; source: string }[]).filter((r) => !AGG_SOURCES.includes(r.source));
  const salesTotal = sales.reduce((a, r) => a + Number(r.amount), 0);
  const counts = (todayCounts.data ?? []) as { id: string; total: number; diff: number | null; location: string }[];
  const lastDiff = counts.length ? counts[counts.length - 1].diff : null;
  const openCount = ((openExp.data ?? []) as { method: string; reimbursed_on: string | null }[])
    .filter((r) => !(r.method === "advance" && r.reimbursed_on)).length;
  const monthTotal = cats.reduce((a, c) => a + c.amount, 0);
  const md = `${Number(today.slice(5, 7))}月${Number(today.slice(8, 10))}日`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ホーム"
        store={store?.name ?? "店舗未選択"}
        lead={`今日（${md}）やることと、いまの状況です。下の大きなボタンから始めてください。`}
      />

      {!store && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          店舗が選ばれていません。左上（スマホは右上）の店舗から選んでください。
        </p>
      )}

      {/* 毎日の3つの作業 */}
      <section className="grid gap-3 sm:grid-cols-3">
        <TaskCard
          href="/sales"
          icon="cart"
          title="売上を入れる"
          desc="お客様からお金を受け取ったら"
          status={sales.length ? `今日 ${sales.length}件・${yen(salesTotal)}円` : "今日はまだ0件"}
          done={sales.length > 0}
        />
        <TaskCard
          href="/expense"
          icon="receipt"
          title="経費を入れる"
          desc="買い物をした・請求書が来たら"
          status={openCount ? `あとで精算するもの ${openCount}件` : "精算待ちはありません"}
          done={openCount === 0}
          warn={openCount > 0}
        />
        <TaskCard
          href="/count"
          icon="wallet"
          title="レジ締め"
          desc="閉店時にレジのお金を数える"
          status={
            counts.length
              ? lastDiff
                ? `今日は済み（差 ${yen(lastDiff)}円）`
                : "今日は済み・ぴったり"
              : "今日はまだ"
          }
          done={counts.length > 0 && !lastDiff}
          warn={counts.length > 0 && Boolean(lastDiff)}
        />
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title="レジのお金（帳簿の残高）" hint="出し入れの記録から計算した、いまレジにあるはずの金額">
          <p className="text-3xl font-bold tabular-nums">{yen(balance)} <span className="text-lg">円</span></p>
          <Link href="/cash" className="mt-2 inline-block text-sm font-semibold text-(--color-gold) hover:underline">出し入れの記録を見る →</Link>
        </Panel>
        <Panel title={`今月の売上（${Number(month.slice(5))}月）`} hint="税抜・この店舗の合計">
          <p className="text-3xl font-bold tabular-nums">{yen(monthTotal)} <span className="text-lg">円</span></p>
          <Link href="/analysis" className="mt-2 inline-block text-sm font-semibold text-(--color-gold) hover:underline">くわしく見る →</Link>
        </Panel>
      </div>

      <Panel title="今月の売上の内訳">
        {cats.length === 0 ? (
          <Empty>まだ今月の売上がありません。「売上を入れる」から記録してください</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {cats.slice(0, 10).map((c) => (
              <li key={c.name} className="flex items-center justify-between py-2.5 text-[15px]">
                <span>{c.name}</span>
                <span className="font-semibold tabular-nums">{yen(c.amount)} 円</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {actor.canManageAll && <OwnerSection companyId={actor.companyId} />}
    </div>
  );
}

function TaskCard({
  href, icon, title, desc, status, done, warn = false,
}: {
  href: string;
  icon: "cart" | "receipt" | "wallet";
  title: string;
  desc: string;
  status: string;
  done: boolean;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-2xl border border-(--color-line) bg-white p-5 shadow-sm transition hover:border-(--color-gold) hover:shadow-md"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--color-gold) text-white">
        <Icon name={icon} />
      </span>
      <span>
        <span className="block text-xl font-bold">{title}</span>
        <span className="block text-sm text-(--color-dim)">{desc}</span>
      </span>
      <span
        className={`mt-auto inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ${
          warn ? "bg-amber-50 text-amber-800" : done ? "bg-emerald-50 text-emerald-700" : "bg-(--color-panel-2) text-(--color-dim)"
        }`}
      >
        {done && !warn ? "✓ " : ""}
        {status}
      </span>
    </Link>
  );
}

/**
 * オーナーだけ: 全社のカード・口座の明細（店舗に紐づかない数字・#134）
 */
async function OwnerSection({ companyId }: { companyId: string }) {
  const admin = createAdmin();
  const { data: txns } = await admin
    .from("mon_bank_txn")
    .select("txn_date, amount, status")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  const all = (txns ?? []) as Txn[];
  const unassigned = all.filter((t) => t.status === "unassigned").length;

  const byMonth = new Map<string, number>();
  for (const t of all) {
    if (t.status !== "confirmed" || t.amount >= 0) continue;
    const m = t.txn_date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + Math.abs(t.amount));
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

  return (
    <section className="space-y-3 rounded-2xl border border-dashed border-(--color-line) p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          会社全体（オーナーのみ） <Badge tone="ok">全社</Badge>
        </h2>
        <Link href="/import" className={btnCls}>カード・口座を取り込む</Link>
      </div>
      <p className="text-sm text-(--color-dim)">法人カード・口座の明細は店舗に分かれないため、会社全体の数字です。</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel title="振り分けが済んでいない明細">
          <p className="text-3xl font-bold tabular-nums">{unassigned}<span className="text-lg"> 件</span></p>
          <p className="mt-1 text-sm">
            {unassigned > 0 ? (
              <Link href="/import" className="font-semibold text-(--color-gold) hover:underline">振り分ける →</Link>
            ) : (
              <span className="text-(--color-ok)">すべて済んでいます</span>
            )}
          </p>
        </Panel>
        <Panel title="取り込んだ明細" className="sm:col-span-2">
          <p className="text-3xl font-bold tabular-nums">{all.length}<span className="text-lg"> 件</span></p>
          <p className="mt-1 text-sm text-(--color-dim)">
            経費として確定 {all.filter((t) => t.status === "confirmed").length} ／ 対象外 {all.filter((t) => t.status === "ignored").length}
          </p>
        </Panel>
      </div>

      <Panel title="月ごとの経費（カード・口座・確定分）">
        {months.length === 0 ? (
          <Empty>まだ確定した経費がありません。取り込み → 振り分けで入ります</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {months.map(([m, v]) => (
              <li key={m} className="flex items-center justify-between py-2.5 text-[15px]">
                <span>{Number(m.slice(0, 4))}年{Number(m.slice(5))}月</span>
                <span className="font-semibold tabular-nums">{yen(v)} 円</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-xs text-(--color-dim)">確定した経費は会社の損益（GENESIS の営業利益）に自動で入ります。</p>
    </section>
  );
}
