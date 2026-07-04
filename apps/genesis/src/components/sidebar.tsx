"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Cockpit", icon: "◉" },
  { href: "/command", label: "CEO AI Command", icon: "⌘" },
  { href: "/events", label: "Company Events", icon: "⚡" },
  { href: "/memories", label: "Business Memory", icon: "🧠" },
  { href: "/decisions", label: "Decision Log", icon: "⚖" },
  { href: "/agents", label: "AI Agents", icon: "🤖" },
  { href: "/approvals", label: "Approvals", icon: "✓" },
  { href: "/dev", label: "Development", icon: "🛠" },
  { href: "/future", label: "Future", icon: "📈" },
  { href: "/connectors", label: "Connectors", icon: "🔌" },
];

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[--color-line] bg-[--color-panel] p-3">
      <div className="mb-6 px-2 pt-2">
        <p className="text-xs tracking-[0.3em] text-[--color-gold]">YOZAN</p>
        <p className="text-lg font-bold tracking-wide">GENESIS</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[--color-panel-2] text-sky-300"
                  : "text-[--color-dim] hover:bg-[--color-panel-2] hover:text-[--color-txt]"
              }`}
            >
              <span className="w-4 text-center text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[--color-line] px-2 pt-3 text-xs text-[--color-dim]">
        <p>{userName}</p>
        <form action="/api/logout" method="post">
          <button className="mt-1 text-[--color-dim] hover:text-[--color-txt]">ログアウト</button>
        </form>
      </div>
    </aside>
  );
}
