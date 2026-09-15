"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, groupOfPath, navItemActive, type NavGroup } from "@/lib/nav";
import { Icon } from "./icons";
import { openPalette } from "./command-palette";

/**
 * 左メニュー（#244・2026-09-15）
 * REDESIGN_2026-07 §3 の「5＋管理（折りたたみ）」をやめ、やることの種類で7グループにした。
 * 開いているグループだけ中身を見せる（アコーディオン）。件数バッジは layout が数える。
 * 既存URLは全て温存（cron・通知リンクを壊さない）。
 */
export type SidebarStore = { id: string; name: string };

// mobile-nav・jarvis の互換用（旧 PRIMARY_NAV/ADMIN_NAV を参照していた所のため）
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

export function Sidebar({
  userName,
  badges,
  stores,
}: {
  userName: string;
  badges: { approve: number; customers: number };
  stores: SidebarStore[];
}) {
  const pathname = usePathname();
  const current = groupOfPath(pathname);
  const [open, setOpen] = useState<NavGroup["key"] | null>(current);

  const badgeOf = (key: NavGroup["key"]) => (key === "approve" ? badges.approve : key === "customers" ? badges.customers : 0);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-(--color-line) bg-(--color-panel) p-3 md:flex">
      <div className="mb-4 px-2 pt-2">
        <p className="text-[11px] font-bold tracking-[0.3em] text-(--color-gold)">YOZAN</p>
        <p className="text-xl font-bold tracking-wide">GENESIS</p>
      </div>

      <button
        type="button"
        onClick={() => openPalette()}
        className="mb-4 flex h-10 items-center gap-2 rounded-lg border border-(--color-line) bg-(--color-bg) px-3 text-sm text-(--color-faint) hover:border-sky-700"
      >
        <Icon name="search" size={16} />
        <span className="flex-1 text-left">探す・移動する</span>
        <kbd className="rounded border border-(--color-line) px-1.5 text-[11px]">Ctrl K</kbd>
      </button>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {NAV_GROUPS.map((g) => {
          const isCurrent = g.key === current;
          const isOpen = open === g.key;
          const badge = badgeOf(g.key);
          const single = g.items.length === 1;
          const head = (
            <>
              <Icon name={g.icon} size={20} className={isCurrent ? "text-(--color-accent)" : "text-(--color-dim)"} />
              <span className="min-w-0 flex-1 truncate">{g.label}</span>
              {badge > 0 && (
                <span className="tnum flex h-5 min-w-5 items-center justify-center rounded-full bg-(--color-danger) px-1.5 text-[12px] font-bold text-[#0b0f17]">
                  {badge}
                </span>
              )}
              {!single && <span className="text-xs text-(--color-faint)">{isOpen ? "▾" : "▸"}</span>}
            </>
          );
          const cls = `flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors ${
            isCurrent ? "bg-(--color-panel-2) font-bold text-(--color-accent)" : "text-(--color-txt) hover:bg-(--color-panel-2)"
          }`;
          return (
            <div key={g.key}>
              {single ? (
                <Link href={g.items[0].href} className={cls}>
                  {head}
                </Link>
              ) : (
                <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} className={`w-full ${cls}`}>
                  {head}
                </button>
              )}
              {isOpen && !single && (
                <div className="mb-1 ml-4 flex flex-col gap-0.5 border-l border-(--color-line) pl-3">
                  {g.items.map((it) => {
                    const on = navItemActive(pathname, it.href);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        className={`flex h-9 items-center rounded-md px-2 text-sm ${
                          on ? "text-(--color-accent)" : "text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt)"
                        }`}
                      >
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* 店舗のシステム（⑧）: 店名を押すとその店の入口一覧へ */}
        {stores.length > 0 && (
          <div className="mt-4 border-t border-(--color-line) px-3 pt-3">
            <p className="mb-1 text-xs font-bold text-(--color-faint)">店舗のシステム</p>
            {stores.map((s) => (
              <Link
                key={s.id}
                href={`/stores?store=${s.id}`}
                className="flex h-9 items-center gap-2 rounded-md text-sm text-(--color-dim) hover:text-(--color-txt)"
              >
                <Icon name="store" size={16} />
                <span className="truncate">{s.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-(--color-line) px-2 pt-3 text-xs text-(--color-dim)">
        <p>{userName}</p>
        <form action="/api/logout" method="post">
          <button className="mt-1 text-(--color-dim) transition-colors hover:text-(--color-txt)">ログアウト</button>
        </form>
      </div>
    </aside>
  );
}
