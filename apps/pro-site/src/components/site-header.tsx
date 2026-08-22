"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const MENU = [
  { href: "", label: "TOP" },
  { href: "/news", label: "NEWS" },
  { href: "/schedule", label: "SCHEDULE / RESULT" },
  { href: "/profile", label: "PROFILE" },
];

export default function SiteHeader({ slug, name, nameEn }: { slug: string; name: string; nameEn: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const base = `/${slug}`;

  return (
    <header className="sticky top-0 z-40 border-b border-(--color-line) bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href={base} className="leading-tight" onClick={() => setOpen(false)}>
          <span className="block text-lg font-black tracking-wide">{name}</span>
          <span className="sec-title block text-[10px] uppercase text-(--color-gold)">
            {nameEn || "Official Site"}
          </span>
        </Link>
        <nav className="hidden gap-6 md:flex">
          {MENU.map((m) => {
            const href = `${base}${m.href}`;
            const active = m.href === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={m.label}
                href={href}
                className={`sec-title text-xs ${active ? "text-(--color-gold)" : "text-(--color-txt)"} hover:text-(--color-gold)`}
              >
                {m.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          aria-label="メニュー"
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`h-0.5 w-6 bg-(--color-ink) transition ${open ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`h-0.5 w-6 bg-(--color-ink) transition ${open ? "opacity-0" : ""}`} />
          <span className={`h-0.5 w-6 bg-(--color-ink) transition ${open ? "-translate-y-2 -rotate-45" : ""}`} />
        </button>
      </div>
      {open ? (
        <nav className="border-t border-(--color-line) bg-white md:hidden">
          {MENU.map((m) => (
            <Link
              key={m.label}
              href={`${base}${m.href}`}
              className="sec-title block border-b border-(--color-line) px-6 py-4 text-sm"
              onClick={() => setOpen(false)}
            >
              {m.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
