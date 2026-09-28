"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { StoreSwitcher } from "@/components/store-switcher";
import type { AccessibleStore } from "@/lib/auth";

/*
 * メニュー（2026-09-28 作り直し・ユーザー依頼「どこに何があるか分からない」）
 *
 * 以前は9個の項目が横一列に並び、「現金出納」「金種棚卸」「証憑」など経理の言葉だった。
 *   - 仕事ごとに3つにまとめる（毎日の作業／確認する／管理）
 *   - 言葉を現場の言い方にする（レジ締め・レシート など）。元の言葉は小さく添えて、経理の人も迷わないように
 *   - PC＝左のメニュー、スマホ＝下のタブ（よく使う5つ）＋右上の「メニュー」
 *   - 同じ仕事の画面は1つの項目にまとめ、画面の中のタブで行き来する
 *     （レジのお金＝/count と /cash、経費＝/expense と /receipts、売上を見る＝/analysis 以下）
 *
 * ownerOnly: 全社の数字を扱う画面。現場アカウントには出さない（#134・遮断はサーバー側）
 */

type Item = {
  href: string;
  label: string;
  /** 経理の言い方（小さく添える） */
  sub?: string;
  icon: IconName;
  /** この項目に含まれる画面（ここで始まるURLなら選択中にする） */
  match: string[];
  ownerOnly?: boolean;
};

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "毎日の作業",
    items: [
      { href: "/", label: "ホーム", icon: "home", match: ["/"] },
      { href: "/sales", label: "売上を入れる", icon: "cart", match: ["/sales"] },
      { href: "/expense", label: "経費を入れる", sub: "レシート・請求書も", icon: "receipt", match: ["/expense", "/receipts"] },
      { href: "/count", label: "レジのお金", sub: "レジ締め・出し入れ", icon: "wallet", match: ["/count", "/cash"] },
    ],
  },
  {
    title: "確認する",
    items: [{ href: "/analysis", label: "売上を見る", sub: "月ごと・商品ごと", icon: "chart", match: ["/analysis"] }],
  },
  {
    title: "管理",
    items: [
      { href: "/import", label: "カード・口座の取込", sub: "オーナーのみ", icon: "bank", match: ["/import"], ownerOnly: true },
      { href: "/settings", label: "担当プロの設定", sub: "給与連携（パーソナル）", icon: "gear", match: ["/settings"] },
      { href: "/manual", label: "使い方", icon: "help", match: ["/manual"] },
    ],
  },
];

/** スマホの下タブ（よく使う順に5つまで） */
const TABS: { href: string; label: string; icon: IconName; match: string[] }[] = [
  { href: "/", label: "ホーム", icon: "home", match: ["/"] },
  { href: "/sales", label: "売上", icon: "cart", match: ["/sales"] },
  { href: "/expense", label: "経費", icon: "receipt", match: ["/expense", "/receipts"] },
  { href: "/count", label: "レジ", icon: "wallet", match: ["/count", "/cash"] },
  { href: "/analysis", label: "見る", icon: "chart", match: ["/analysis"] },
];

function isActive(path: string, match: string[]): boolean {
  return match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(`${m}/`)));
}

type Props = {
  userName: string;
  stores: AccessibleStore[];
  currentStoreId: string | null;
  canManageAll?: boolean;
  children: React.ReactNode;
};

export function AppShell({ userName, stores, currentStoreId, canManageAll = false, children }: Props) {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canManageAll || !i.ownerOnly) }));

  const menu = (
    <nav className="space-y-5" aria-label="メニュー">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 px-3 text-xs font-semibold tracking-wider text-(--color-dim)">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const on = isActive(path, i.match);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                      on ? "bg-(--color-gold-soft) text-(--color-gold)" : "text-(--color-txt) hover:bg-(--color-panel-2)"
                    }`}
                  >
                    <Icon name={i.icon} className={on ? "text-(--color-gold)" : "text-(--color-dim)"} />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold leading-tight">{i.label}</span>
                      {i.sub && <span className="block text-xs text-(--color-dim)">{i.sub}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const account = (
    <div className="space-y-2 border-t border-(--color-line) pt-4">
      <p className="px-3 text-sm text-(--color-dim)">{userName} さん</p>
      <form action="/api/logout" method="post">
        <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-accent)">
          ログアウト
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* PC: 左のメニュー */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-(--color-line) bg-white p-4 md:flex print:hidden">
        <Brand />
        <div>
          <p className="mb-1 px-1 text-xs text-(--color-dim)">いまの店舗</p>
          <StoreSwitcher stores={stores} currentId={currentStoreId} />
        </div>
        <div className="flex-1">{menu}</div>
        {account}
      </aside>

      <div className="min-w-0 flex-1">
        {/* スマホ: 上のバー */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-(--color-line) bg-white/95 px-4 py-2.5 backdrop-blur md:hidden print:hidden">
          <Brand compact />
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 max-w-[44vw]">
              <StoreSwitcher stores={stores} currentId={currentStoreId} />
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-(--color-line) px-3 text-sm font-semibold"
              aria-label="メニューを開く"
            >
              <Icon name="menu" /> メニュー
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>

      {/* スマホ: 下のタブ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-(--color-line) bg-white pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
        aria-label="よく使う画面"
      >
        {TABS.map((t) => {
          const on = isActive(path, t.match);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${on ? "text-(--color-gold)" : "text-(--color-dim)"}`}
            >
              <Icon name={t.icon} />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* スマホ: 全部のメニュー */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="メニュー">
          <button className="absolute inset-0 bg-black/30" aria-label="閉じる" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col gap-5 overflow-y-auto bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="h-10 rounded-lg border border-(--color-line) px-3 text-sm">
                閉じる
              </button>
            </div>
            <div className="flex-1">{menu}</div>
            {account}
          </div>
        </div>
      )}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--color-gold) text-white">
        <Icon name="yen" />
      </span>
      <span className="leading-tight">
        {!compact && <span className="block text-[11px] tracking-[0.25em] text-(--color-brand)">YOZAN</span>}
        <span className={`block font-bold ${compact ? "text-sm" : "text-base"}`}>お金管理</span>
      </span>
    </Link>
  );
}

type IconName = "home" | "cart" | "receipt" | "wallet" | "chart" | "bank" | "gear" | "help" | "menu" | "yen";

const PATHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  cart: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5a1 1 0 1 0 0-.01M17 20.5a1 1 0 1 0 0-.01",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  bank: "M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01",
  menu: "M4 7h16M4 12h16M4 17h16",
  yen: "M6 4l6 8 6-8M12 12v8M8 13h8M8 16.5h8",
};

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
