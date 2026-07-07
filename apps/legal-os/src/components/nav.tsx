import Link from "next/link";

export function TopBar({ userName, role }: { userName: string; role: string }) {
  const roleLabel =
    role === "manager" ? "法務管理" : role === "uploader" ? "登録担当" : "閲覧";
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[--color-line] bg-[--color-panel] px-5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs tracking-[0.3em] text-[--color-gold]">YOZAN</span>
        <span className="text-base font-bold tracking-wide">Legal OS</span>
        <span className="ml-1 flex items-center gap-1.5 text-[10px] text-emerald-300/80">
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          ONLINE
        </span>
      </div>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/" className="text-[--color-dim] transition-colors hover:text-[--color-txt]">ダッシュボード</Link>
        <Link href="/documents" className="text-[--color-dim] transition-colors hover:text-[--color-txt]">契約一覧</Link>
        <Link href="/documents/new" className="text-[--color-dim] transition-colors hover:text-[--color-txt]">登録</Link>
        <span className="text-[--color-dim]">|</span>
        <span className="text-xs text-[--color-dim]">{userName}（{roleLabel}）</span>
        <form action="/api/logout" method="post">
          <button className="text-xs text-[--color-dim] transition-colors hover:text-[--color-txt]">ログアウト</button>
        </form>
      </nav>
    </header>
  );
}
