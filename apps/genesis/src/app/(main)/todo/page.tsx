import { requireGenesisActor } from "@/lib/auth";
import { getHomeData } from "@/lib/todo";
import { TodoList } from "@/components/home/todo";
import { StalledBand } from "@/components/home/stalled-band";

export const dynamic = "force-dynamic";

/**
 * 今日やること（全件・#244）。スマホの下タブ「やること」の行き先。
 * 中身はホームと同じ TodoList（同じ件数・同じ並び）。行を押すとホームの右パネルで開く。
 */
export default async function TodoPage() {
  const actor = await requireGenesisActor();
  const { todos, stalled } = await getHomeData(actor);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">今日やること</h1>
        <span className={`tnum text-[15px] font-bold ${todos.length ? "text-(--color-danger)" : "text-(--color-ok)"}`}>{todos.length}件</span>
      </div>
      <StalledBand items={stalled} />
      <section className="rounded-xl border border-(--color-line) bg-(--color-panel)">
        <TodoList todos={todos} base="/" />
      </section>
    </div>
  );
}
