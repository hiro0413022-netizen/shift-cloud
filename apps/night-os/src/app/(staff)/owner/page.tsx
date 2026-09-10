import Link from "next/link";
import { Avatar, Yen } from "@/components/ui";
import { businessDate, castDaysForStore, daySummary, getActiveRules, listFloor, resolveNightStore } from "@/lib/night";

export const dynamic = "force-dynamic";

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const store = await resolveNightStore();
  if (!store) return <main className="p-6 text-sm text-(--color-dim)">店舗が登録されていません。</main>;

  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : businessDate();
  const { rules } = await getActiveRules(store.id);
  const [summary, days, tables] = await Promise.all([
    daySummary(store.id, date, rules),
    castDaysForStore(store.id, date, rules),
    listFloor(store.id, rules, date),
  ]);
  const openTables = tables.filter((t) => t.slip).sort((a, b) => (b.slip!.totals.total ?? 0) - (a.slip!.totals.total ?? 0));
  const maxTable = openTables[0]?.slip?.totals.total ?? 1;

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h1 className="text-sm font-bold">本日</h1>
        <span className="text-xs text-(--color-dim)">{date}</span>
        <div className="grow" />
        <Link href="/owner/closing" className="text-xs text-(--color-accent)">
          月次の締めへ →
        </Link>
      </div>

      <section className="rounded-xl border border-(--color-line) bg-white p-4">
        <div className="text-xs text-(--color-dim)">本日の売上（速報）</div>
        <div className="mn text-[38px] font-bold leading-none">
          <Yen value={summary.sales} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-(--color-bg) px-2.5 py-2">
            <div className="text-[10px] text-(--color-dim)">組数</div>
            <div className="text-base font-bold">{summary.groups}</div>
          </div>
          <div className="rounded-lg bg-(--color-bg) px-2.5 py-2">
            <div className="text-[10px] text-(--color-dim)">組単価</div>
            <div className="text-base font-bold">
              <Yen value={summary.perGroup} />
            </div>
          </div>
          <div className="rounded-lg bg-(--color-accent-soft) px-2.5 py-2">
            <div className="text-[10px] text-(--color-accent-2)">人件費率</div>
            <div className="text-base font-bold text-(--color-accent)">{summary.laborRate}%</div>
          </div>
        </div>
      </section>

      {summary.missingCastSlips > 0 && (
        <Link
          href="/floor"
          className="mt-3 flex items-center gap-3 rounded-xl border border-(--color-accent-soft) bg-white p-3"
        >
          <span className="grow">
            <span className="block text-xs font-bold text-(--color-accent)">
              担当が入っていない伝票 {summary.missingCastSlips}件
            </span>
            <span className="block text-[10px] text-(--color-dim)">このままではお会計に進めません</span>
          </span>
          <span className="text-(--color-accent)">›</span>
        </Link>
      )}

      <section className="mt-3 rounded-xl border border-(--color-line) bg-white p-4">
        <div className="mb-2 flex items-center">
          <span className="text-xs font-bold">いま入っている卓</span>
          <div className="grow" />
          <span className="text-[11px] text-(--color-dim)">
            {summary.openTables}卓 ・ {summary.guestsNow}名
          </span>
        </div>
        {openTables.length === 0 && <p className="text-[11px] text-(--color-mute)">在店の卓はありません。</p>}
        <div className="flex flex-col gap-2">
          {openTables.map((t) => (
            <div key={t.id} className="flex items-center gap-3">
              <span className="w-12 text-xs font-bold">{t.code}</span>
              <span className="h-1.5 grow overflow-hidden rounded bg-(--color-panel-2)">
                <span
                  className="block h-full bg-(--color-accent)"
                  style={{ width: `${Math.round(((t.slip?.totals.total ?? 0) / maxTable) * 100)}%` }}
                />
              </span>
              <span className="w-24 text-right text-sm font-bold">
                <Yen value={t.slip?.totals.total ?? 0} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-3 rounded-xl border border-(--color-line) bg-white p-4">
        <div className="mb-1 flex items-center">
          <span className="text-xs font-bold">今日のキャスト日当</span>
          <div className="grow" />
          <span className="text-[11px] text-(--color-dim)">
            合計 <Yen value={summary.laborCost} />
          </span>
        </div>
        {days.length === 0 && <p className="text-[11px] text-(--color-mute)">出勤の打刻がまだありません。</p>}
        <div className="flex flex-col">
          {days.map((d, i) => (
            <div key={d.cast.id} className="flex items-center gap-3 border-b border-(--color-panel-2) py-2 last:border-b-0">
              <Avatar name={d.cast.displayName} tone={i} />
              <div className="grow">
                <div className="text-xs font-medium">{d.cast.name}</div>
                <div className="mt-0.5 text-[10px] text-(--color-dim)">
                  {(d.minutes / 60).toFixed(1)}h ・ 本{d.pay.metrics.nomination} 場{d.pay.metrics.inhouse_nomination} ドリンク
                  {d.pay.metrics.cast_drink}
                  {d.broughtCustomer && " ・ 同伴"}
                </div>
              </div>
              <div className="text-[15px] font-bold">
                <Yen value={d.pay.net} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
