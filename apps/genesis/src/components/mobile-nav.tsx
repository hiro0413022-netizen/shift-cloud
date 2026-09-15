"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, navItemActive } from "@/lib/nav";
import { Icon } from "./icons";
import { openPalette } from "./command-palette";
import type { SidebarStore } from "./sidebar";

/**
 * スマホのナビ（#244・2026-09-15 ユーザー要望「スマホで見やすくしたい」）
 * - 下に5タブ（ホーム / やること / 数字 / 探す / 店舗）＝親指で届く場所に集める
 * - 上は薄いバー（ロゴ＋メニュー）。メニューは7グループの全画面一覧
 * md以上では非表示（Sidebar が出る）。
 */
export function MobileNav({
  userName,
  badges,
  stores,
}: {
  userName: string;
  badges: { approve: number; customers: number };
  stores: SidebarStore[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  const todoCount = badges.approve + badges.customers;
  const tabs: { key: string; label: string; icon: "home" | "check" | "chart" | "search" | "store"; href?: string; badge?: number; active: boolean }[] = [
    { key: "home", label: "ホーム", icon: "home", href: "/", active: pathname === "/" },
    { key: "todo", label: "やること", icon: "check", href: "/todo", badge: todoCount, active: pathname.startsWith("/todo") },
    { key: "numbers", label: "数字", icon: "chart", href: "/finance", active: pathname.startsWith("/finance") },
    { key: "search", label: "探す", icon: "search", active: false },
    { key: "stores", label: "店舗", icon: "store", href: "/stores", active: pathname.startsWith("/stores") },
  ];

  return (
    <div className="md:hidden">
      <header
        className="sticky z-30 flex items-center justify-between border-b border-(--color-line) bg-(--color-panel)/95 px-4 py-2.5 backdrop-blur"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <Link href="/" className="leading-tight">
          <span className="block text-[9px] font-bold tracking-[0.3em] text-(--color-gold)">YOZAN</span>
          <span className="block text-sm font-bold tracking-wide">GENESIS</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="メニューを開く"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-(--color-line) bg-(--color-panel-2)"
        >
          <Icon name="menu" size={20} />
        </button>
      </header>

      {/* 下タブ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-(--color-line) bg-(--color-panel)/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {tabs.map((t) => {
          const inner = (
            <>
              <Icon name={t.icon} size={22} />
              <span className="text-[11px]">{t.label}</span>
              {t.badge != null && t.badge > 0 && (
                <span className="tnum absolute right-3 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-(--color-danger) px-1 text-[11px] font-bold text-[#0b0f17]">
                  {t.badge}
                </span>
              )}
            </>
          );
          const cls = `relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 ${
            t.active ? "font-bold text-(--color-accent)" : "text-(--color-dim)"
          }`;
          return t.href ? (
            <Link key={t.key} href={t.href} className={cls}>
              {inner}
            </Link>
          ) : (
            <button key={t.key} type="button" onClick={() => openPalette()} className={cls}>
              {inner}
            </button>
          );
        })}
      </nav>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[19rem] max-w-[90vw] flex-col border-l border-(--color-line) bg-(--color-panel) p-3">
            <div className="mb-3 flex items-start justify-between px-2 pt-2">
              <div>
                <p className="text-xs font-bold tracking-[0.3em] text-(--color-gold)">YOZAN</p>
                <p className="text-lg font-bold tracking-wide">GENESIS</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-(--color-line) text-(--color-dim)"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
              {NAV_GROUPS.map((g) => (
                <div key={g.key}>
                  <p className="flex items-center gap-2 px-3 pb-1 text-xs font-bold text-(--color-faint)">
                    <Icon name={g.icon} size={14} />
                    {g.label}
                  </p>
                  {g.items.map((it) => {
                    const on = navItemActive(pathname, it.href);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        className={`flex min-h-11 items-center rounded-lg px-3 text-[15px] ${
                          on ? "bg-(--color-panel-2) text-(--color-accent)" : "text-(--color-txt)"
                        }`}
                      >
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
              {stores.length > 0 && (
                <div>
                  <p className="px-3 pb-1 text-xs font-bold text-(--color-faint)">店舗のシステム</p>
                  {stores.map((s) => (
                    <Link key={s.id} href={`/stores?store=${s.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-[15px]">
                      <Icon name="store" size={16} />
                      {s.name}
                    </Link>
                  ))}
                </div>
              )}
            </nav>
            <div className="border-t border-(--color-line) px-2 pt-3 text-xs text-(--color-dim)">
              <p>{userName}</p>
              <form action="/api/logout" method="post">
                <button className="mt-1 py-1 text-(--color-dim)">ログアウト</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
