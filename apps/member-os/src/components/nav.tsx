"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ナビの出し分け（#134・店舗またぎ廃止）
 * scope: "all" = 全員 / "frank" = FRANK姫路の配属者だけ / "gw" = GOLF WING宝塚の配属者だけ。
 * ★ 隠すだけでは守れない。各画面・各アクションのサーバー側でも必ず検証すること。
 */
const LINKS: Array<{ href: string; label: string; scope: "all" | "frank" | "gw" }> = [
  { href: "/dashboard", label: "ダッシュボード", scope: "all" },
  { href: "/", label: "受付台帳", scope: "all" },
  { href: "/search", label: "来店検索", scope: "all" },
  { href: "/follow", label: "体験フォロー", scope: "all" },
  { href: "/trials", label: "体験申込", scope: "frank" },
  { href: "/reservations", label: "予約（姫路）", scope: "frank" },
  { href: "/frunk", label: "FRANK会員", scope: "frank" },
  { href: "/orders", label: "電子伝票", scope: "frank" },
  { href: "/checkin", label: "チェックイン", scope: "frank" },
  { href: "/import", label: "データ取込", scope: "gw" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar({
  userName,
  brand,
  canFrank,
  canGolfWing,
}: {
  userName: string;
  brand: string;
  canFrank: boolean;
  canGolfWing: boolean;
}) {
  const pathname = usePathname() || "/";
  const links = LINKS.filter(
    (l) => l.scope === "all" || (l.scope === "frank" ? canFrank : canGolfWing),
  );
  return (
    <header className="topbar sticky top-0 z-20 border-b border-(--color-line) bg-(--color-panel)/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-baseline gap-2">
            <span className="max-w-[10rem] truncate text-[11px] font-semibold tracking-[0.22em] text-(--color-gold)">{brand}</span>
            <span className="text-base font-bold tracking-tight text-(--color-txt)">Member OS</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt)"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-(--color-dim) sm:inline">{userName}</span>
          <form action="/api/logout" method="post">
            <button className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-xs font-medium text-(--color-dim) transition-colors hover:text-(--color-txt)">
              ログアウト
            </button>
          </form>
        </div>
      </div>
      {/* モバイル用ナビ */}
      <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {links.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-accent/10 text-accent" : "text-(--color-dim)"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
