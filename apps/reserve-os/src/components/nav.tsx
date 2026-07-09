"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [{ href: "/", label: "申込一覧" }];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar({ userName }: { userName: string }) {
  const pathname = usePathname() || "/";
  return (
    <header className="sticky top-0 z-20 border-b border-[--color-line] bg-[--color-panel]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold tracking-[0.28em] text-[--color-gold]">GOLF WING</span>
            <span className="text-base font-bold tracking-tight text-[--color-txt]">Reserve OS</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-[--color-accent]/10 text-[--color-accent]" : "text-[--color-dim] hover:bg-[--color-panel-2] hover:text-[--color-txt]"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-[--color-dim] sm:inline">{userName}</span>
          <form action="/api/logout" method="post">
            <button className="rounded-lg border border-[--color-line] bg-white px-3 py-1.5 text-xs font-medium text-[--color-dim] transition-colors hover:text-[--color-txt]">
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
