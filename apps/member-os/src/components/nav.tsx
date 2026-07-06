import Link from "next/link";

export function TopBar({ userName }: { userName: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[--color-line] bg-[--color-panel] px-5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs tracking-[0.3em] text-[--color-gold]">GOLF WING</span>
        <span className="text-base font-bold tracking-wide">Member OS</span>
        <span className="ml-1 flex items-center gap-1.5 text-[10px] text-emerald-300/80">
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ONLINE
        </span>
      </div>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/" className="text-[--color-dim] transition-colors hover:text-[--color-txt]">受付台帳</Link>
        <Link href="/reservations" className="text-[--color-dim] transition-colors hover:text-[--color-txt]">予約(姫路)</Link>
        <Link href="/import" className="text-[--color-dim] transition-colors hover:text-[--color-txt]">Smart Hello取込</Link>
        <span className="text-[--color-dim]">|</span>
        <span className="text-xs text-[--color-dim]">{userName}</span>
        <form action="/api/logout" method="post">
          <button className="text-xs text-[--color-dim] transition-colors hover:text-[--color-txt]">ログアウト</button>
        </form>
      </nav>
    </header>
  );
}
