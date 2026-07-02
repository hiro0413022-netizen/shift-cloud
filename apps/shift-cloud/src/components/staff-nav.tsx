"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/home", label: "ホーム", icon: "🏠" },
  { href: "/shifts", label: "シフト", icon: "📅" },
  { href: "/requests", label: "希望提出", icon: "✋" },
  { href: "/notices", label: "お知らせ", icon: "🔔" },
];

export function StaffNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${
              path.startsWith(t.href) ? "font-semibold text-brand" : "text-zinc-400"
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
