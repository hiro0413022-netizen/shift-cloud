"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./sidebar";

/**
 * モバイル用ナビ（NEXT_TASKS MB / DESIGN_SYSTEM「モバイル対応」）
 * md未満: 上部固定バー（ロゴ＋ハンバーガー）＋左スライドのドロワー。md以上: 非表示（Sidebarが出る）。
 */
export function MobileNav({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // ページ遷移でドロワーを閉じる
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="md:hidden">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-(--color-line) bg-(--color-panel)/95 px-4 py-3 backdrop-blur">
        <Link href="/" className="leading-tight">
          <span className="block text-[9px] tracking-[0.3em] text-(--color-gold)">YOZAN</span>
          <span className="block text-sm font-bold tracking-wide">GENESIS</span>
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="メニューを開く"
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg border border-(--color-line) bg-(--color-panel-2)"
        >
          <span className="block h-px w-4 bg-(--color-txt)" />
          <span className="block h-px w-4 bg-(--color-txt)" />
          <span className="block h-px w-4 bg-(--color-txt)" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-(--color-line) bg-(--color-panel) p-3">
            <div className="mb-4 flex items-start justify-between px-2 pt-2">
              <div>
                <p className="text-xs tracking-[0.3em] text-(--color-gold)">YOZAN</p>
                <p className="text-lg font-bold tracking-wide">GENESIS</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-(--color-line) text-(--color-dim)"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
                      active
                        ? "bg-(--color-panel-2) text-sky-300 shadow-[inset_2px_0_0_0_#38bdf8]"
                        : "text-(--color-dim)"
                    }`}
                  >
                    <span className="w-4 text-center text-xs">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
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
