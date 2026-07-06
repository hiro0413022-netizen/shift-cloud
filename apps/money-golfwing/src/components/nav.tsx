import Link from "next/link";

const LINKS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/sales", label: "売上" },
  { href: "/cash", label: "現金出納" },
  { href: "/count", label: "金種棚卸" },
  { href: "/import", label: "カード・口座取込" },
];

export function TopBar({ userName }: { userName: string }) {
  return (
    <header className="flex items-center justify-between border-b border-[--color-line] bg-[--color-panel] px-6 py-3">
      <div className="flex items-center gap-6">
        <div>
          <span className="text-xs tracking-[0.35em] text-[--color-gold]">GOLF WING</span>
          <span className="ml-2 text-sm font-bold">お金管理</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[--color-dim] hover:text-[--color-txt]">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-[--color-dim]">{userName}</span>
        <form action="/api/logout" method="post">
          <button className="text-[--color-dim] hover:text-[--color-accent]">ログアウト</button>
        </form>
      </div>
    </header>
  );
}
