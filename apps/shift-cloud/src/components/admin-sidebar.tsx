"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string };

/**
 * 管理画面のメニュー。
 * PC（md〜）= 左の固定サイドバー。
 * スマホ（md未満）= 上の細いバー＋「メニュー」で開く引き出し。
 *   以前はスマホでも幅208pxのサイドバーが常に出ていて、本文が100px程度しか残らず
 *   シフト表などがほぼ読めなかった。
 */
export function AdminSidebar({ items, name, hq }: { items: Item[]; name: string; hq: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = items.find((i) => path.startsWith(i.href));

  // 画面を移ったら引き出しを閉じる
  useEffect(() => setOpen(false), [path]);
  // 引き出しを開いている間は後ろをスクロールさせない
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const nav = (
    <nav className="space-y-0.5">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`block rounded-md px-2 py-2 text-sm md:py-1.5 ${
            path.startsWith(i.href)
              ? "bg-brand-light font-medium text-brand"
              : "text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          {i.label}
        </Link>
      ))}
      {hq && (
        <Link href="/hq" className="mt-3 block rounded-md px-2 py-2 text-sm text-zinc-600 hover:bg-zinc-50 md:py-1.5">
          🏢 本部ダッシュボード
        </Link>
      )}
      <Link href="/home" className="block rounded-md px-2 py-2 text-sm text-zinc-600 hover:bg-zinc-50 md:py-1.5">
        📱 スタッフ画面
      </Link>
      <form action="/api/logout" method="post" className="mt-3">
        <button className="w-full rounded-md px-2 py-2 text-left text-sm text-zinc-400 hover:bg-zinc-50 md:py-1.5">
          ログアウト
        </button>
      </form>
    </nav>
  );

  return (
    <>
      {/* PC: 固定サイドバー */}
      <aside className="fixed inset-y-0 left-0 hidden w-52 overflow-y-auto border-r border-zinc-200 bg-white px-3 py-5 md:block">
        <p className="mb-1 px-2 text-sm font-semibold tracking-tight">YOZAN Shift Cloud</p>
        <p className="mb-5 px-2 text-xs text-zinc-400">{name}</p>
        {nav}
      </aside>

      {/* スマホ: 上部バー */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="メニューを開く"
          aria-expanded={open}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 active:bg-zinc-100"
        >
          <span aria-hidden className="text-base leading-none">☰</span>
          メニュー
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{current?.label ?? "管理画面"}</p>
        <Link href="/home" className="shrink-0 rounded-lg px-2 py-2 text-xs text-zinc-500 active:bg-zinc-100">
          スタッフ画面
        </Link>
      </header>

      {/* スマホ: 引き出し */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button type="button" aria-label="メニューを閉じる" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white px-3 py-4 shadow-xl">
            <div className="mb-4 flex items-start justify-between px-2">
              <div>
                <p className="text-sm font-semibold tracking-tight">YOZAN Shift Cloud</p>
                <p className="text-xs text-zinc-400">{name}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="閉じる"
                className="-mr-1 h-9 w-9 rounded-lg text-lg text-zinc-400 active:bg-zinc-100">
                ×
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
