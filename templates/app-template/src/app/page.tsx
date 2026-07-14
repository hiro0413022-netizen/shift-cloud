import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";

export default async function HomePage() {
  const actor = await requireActor();

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
          <h1 className="text-2xl font-bold tracking-widest">__APP_TITLE__</h1>
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-(--color-dim) hover:text-(--color-txt)">
            {actor.name} — ログアウト
          </button>
        </form>
      </header>

      <section className={cardCls}>
        <h2 className="mb-2 font-semibold">ダッシュボード</h2>
        <p className="text-sm text-(--color-dim)">
          ここに __APP_TITLE__ の機能を実装する（スキーマ接頭辞: <code>__PREFIX___*</code>）。
        </p>
      </section>
    </main>
  );
}
