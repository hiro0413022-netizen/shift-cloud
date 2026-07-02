"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

export function AdminSidebar({ items, name, hq }: { items: Item[]; name: string; hq: boolean }) {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 w-52 overflow-y-auto border-r border-zinc-200 bg-white px-3 py-5">
      <p className="mb-1 px-2 text-sm font-semibold tracking-tight">YOZAN Shift Cloud</p>
      <p className="mb-5 px-2 text-xs text-zinc-400">{name}</p>
      <nav className="space-y-0.5">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`block rounded-md px-2 py-1.5 text-sm ${
              path.startsWith(i.href)
                ? "bg-brand-light font-medium text-brand"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {i.label}
          </Link>
        ))}
        {hq && (
          <Link href="/hq" className="mt-3 block rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
            🏢 本部ダッシュボード
          </Link>
        )}
        <Link href="/home" className="block rounded-md px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
          📱 スタッフ画面
        </Link>
        <form action="/api/logout" method="post" className="mt-3">
          <button className="w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-50">
            ログアウト
          </button>
        </form>
      </nav>
    </aside>
  );
}
