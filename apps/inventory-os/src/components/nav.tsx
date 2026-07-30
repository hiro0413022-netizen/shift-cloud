import Link from "next/link";

export function TopBar({ userName, role }: { userName: string; role: string }) {
  const roleLabel = role === "manager" ? "在庫管理" : "棚卸担当";
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-line) bg-(--color-panel) px-5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs tracking-[0.3em] text-(--color-gold)">YOZAN</span>
        <span className="text-base font-bold tracking-wide">Inventory OS</span>
        <span className="ml-1 flex items-center gap-1.5 text-[10px] text-emerald-300/80">
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ONLINE
        </span>
      </div>
      {/* iPadでの誤タップを避けるため、リンクは十分な高さを確保する */}
      <nav className="flex items-center gap-1 text-sm">
        <NavLink href="/">在庫状況</NavLink>
        <NavLink href="/count">棚卸</NavLink>
        <NavLink href="/movements">入出庫</NavLink>
        <NavLink href="/items">品番マスタ</NavLink>
        <span className="mx-2 text-(--color-dim)">|</span>
        <span className="text-xs text-(--color-dim)">
          {userName}（{roleLabel}）
        </span>
        <form action="/api/logout" method="post">
          <button className="px-2 py-2 text-xs text-(--color-dim) transition-colors hover:text-(--color-txt)">
            ログアウト
          </button>
        </form>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-(--color-dim) transition-colors hover:bg-(--color-panel-2) hover:text-(--color-txt)"
    >
      {children}
    </Link>
  );
}
