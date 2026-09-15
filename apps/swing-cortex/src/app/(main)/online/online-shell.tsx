"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * オンラインレッスン・モードの外枠（RaRa LESSON テーマ）
 * PC/iPad 横: 上部にナビ ／ スマホ: 下部タブ
 */

const TABS = [
  { href: "/online", en: "Inbox", ja: "受信箱", icon: "M3 7l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" },
  { href: "/online/videos", en: "Videos", ja: "動画", icon: "M15 10l4.5-2.6A1 1 0 0121 8.3v7.4a1 1 0 01-1.5.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
  { href: "/online/templates", en: "Phrases", ja: "定型文", icon: "M8 10h8M8 14h5M21 12c0 4.4-4 8-9 8a9.9 9.9 0 01-4-.8L3 20l1.3-3.9A7.6 7.6 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z" },
  { href: "/online/settings", en: "Settings", ja: "設定", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

function isActive(path: string, href: string) {
  if (href === "/online") return path === "/online" || (/^\/online\/[^/]+$/.test(path) && !TABS.some((t) => t.href === path));
  return path.startsWith(href);
}

export default function OnlineShell({ coachName, children }: { coachName: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="theme-rara min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-(--rr-ink) text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link href="/online" className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="rr-en text-[22px] font-semibold leading-none tracking-[0.12em]">RaRa LESSON</span>
            <span className="hidden text-[10px] tracking-[0.2em] text-white/55 sm:inline">ONLINE DESK</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {TABS.map((t) => {
              const on = isActive(path, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={
                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition " +
                    (on ? "bg-white/12 text-white" : "text-white/60 hover:text-white")
                  }
                >
                  <span className="rr-en mr-1.5 text-[13px] italic text-(--rr-gold)">{t.en}</span>
                  {t.ja}
                </Link>
              );
            })}
          </nav>
          <span className="ml-auto max-w-[40vw] truncate text-[11px] text-white/60">{coachName}</span>
          <form action="/api/logout" method="post">
            <button
              title="ログアウト"
              aria-label="ログアウト"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/70 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </form>
        </div>
        <div className="h-[2px] bg-gradient-to-r from-transparent via-(--rr-gold) to-transparent opacity-60" />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-6 lg:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-(--color-line) bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => {
            const on = isActive(path, t.href);
            return (
              <Link key={t.href} href={t.href} className={"flex flex-1 flex-col items-center gap-0.5 py-2 " + (on ? "text-(--rr-ink)" : "text-(--color-faint)")}>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={on ? 2 : 1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
                </svg>
                <span className="text-[10px] font-medium">{t.ja}</span>
                <span className={"h-0.5 w-5 rounded-full " + (on ? "bg-(--rr-gold)" : "bg-transparent")} />
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
