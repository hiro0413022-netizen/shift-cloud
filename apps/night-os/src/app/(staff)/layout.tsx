import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { resolveNightStore, businessDate } from "@/lib/night";

/**
 * スタッフ側（店舗iPad・オーナー）の共通枠。
 * キャスト用スマホ(/cast)は別レイアウト・別ログインなのでここには入らない。
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const store = await resolveNightStore();

  return (
    <div className="no-select min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-(--color-line) bg-(--color-panel) px-4 py-2.5">
        <div>
          <div className="mn text-base font-bold tracking-wide">{store?.name ?? "Night OS"}</div>
          <div className="text-[11px] text-(--color-dim)">営業日 {businessDate()}</div>
        </div>
        <nav className="ml-2 flex gap-1">
          <Link href="/floor" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-(--color-panel-2)">
            フロア
          </Link>
          <Link href="/owner" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-(--color-panel-2)">
            本日
          </Link>
          <Link href="/owner/closing" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-(--color-panel-2)">
            締め
          </Link>
          <Link href="/settings/backs" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-(--color-panel-2)">
            バック設定
          </Link>
        </nav>
        <div className="grow" />
        <form action="/api/logout" method="post">
          <button className="text-xs text-(--color-dim) hover:text-(--color-txt)">{actor.name} — ログアウト</button>
        </form>
      </header>
      {children}
    </div>
  );
}
