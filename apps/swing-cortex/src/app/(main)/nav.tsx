"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICON: Record<string, string> = {
  home: "M21 21l-4.3-4.3M17 10a7 7 0 11-14 0 7 7 0 0114 0z",
  library:
    "M12 6.25C10.8 5.5 8.7 5 6.5 5 5 5 4 5.2 4 5.4v13C4 18 5 18 6.5 18c2.2 0 4.3.5 5.5 1.25M12 6.25C13.2 5.5 15.3 5 17.5 5c1.5 0 2.5.2 2.5.4v13c0 .2-1 0-2.5 0-2.2 0-4.3.5-5.5 1.25M12 6.25v13",
  insights: "M3 3v18h18M8 15v3M13 10v8M18 6v12",
  settings:
    "M10.3 4.3a1 1 0 011.4 0l.7.7a1 1 0 001 .26l1-.26a1 1 0 011.2.86l.13 1a1 1 0 00.7.8l1 .3a1 1 0 01.6 1.4l-.5.9a1 1 0 000 1l.5.9a1 1 0 01-.6 1.4l-1 .3a1 1 0 00-.7.8l-.13 1a1 1 0 01-1.2.86l-1-.26a1 1 0 00-1 .26l-.7.7a1 1 0 01-1.4 0l-.7-.7a1 1 0 00-1-.26l-1 .26a1 1 0 01-1.2-.86l-.13-1a1 1 0 00-.7-.8l-1-.3a1 1 0 01-.6-1.4l.5-.9a1 1 0 000-1l-.5-.9a1 1 0 01.6-1.4l1-.3a1 1 0 00.7-.8l.13-1a1 1 0 011.2-.86l1 .26a1 1 0 001-.26zM12 15a3 3 0 100-6 3 3 0 000 6z",
};

const TABS = [
  { href: "/library", id: "library", label: "症状別対処法" },
  { href: "/", id: "home", label: "診断" },
  { href: "/insights", id: "insights", label: "インサイト" },
  { href: "/settings", id: "settings", label: "設定" },
];

export default function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="sticky bottom-0 z-20 flex border-t border-(--color-line) bg-(--color-panel) px-2 py-2">
      {TABS.map((t) => {
        const on = active(t.href);
        return (
          <Link
            key={t.id}
            href={t.href}
            className={
              "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 " +
              (on ? "text-(--color-brand)" : "text-(--color-faint)")
            }
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON[t.id]} />
            </svg>
            <span className="text-[10px] font-medium">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
