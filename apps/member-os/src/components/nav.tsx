export function TopBar({ userName }: { userName: string }) {
  return (
    <header className="flex items-center justify-between border-b border-[--color-line] bg-[--color-panel] px-5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs tracking-[0.3em] text-[--color-gold]">GOLF WING</span>
        <span className="text-base font-bold tracking-wide">体験受付 — Member OS</span>
        <span className="ml-1 flex items-center gap-1.5 text-[10px] text-emerald-300/80">
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ONLINE
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-[--color-dim]">
        <span>{userName}</span>
        <form action="/api/logout" method="post">
          <button className="transition-colors hover:text-[--color-txt]">ログアウト</button>
        </form>
      </div>
    </header>
  );
}
