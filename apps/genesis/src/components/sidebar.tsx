"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

// REDESIGN_2026-07 §3: 26画面 → 5＋管理（折りたたみ）。
// 日常で使うのは PRIMARY の4つ＋管理グループのみ。既存URLは全て温存（cron・通知リンクを壊さない）。
export const PRIMARY_NAV = [
  { href: "/", label: "ホーム", en: "Home", icon: "◉" },
  { href: "/chat", label: "チャット", en: "Chat / Ask Data", icon: "💬" },
  { href: "/agents", label: "AI社員", en: "AI Agents", icon: "🤖" },
  { href: "/finance", label: "数字", en: "Finance", icon: "¥" },
];

export const ADMIN_NAV = [
  { href: "/command", label: "CEO AI 司令室", en: "CEO AI Command", icon: "⌘" },
  { href: "/ai-sales", label: "AI営業 司令室", en: "AI Sales Live", icon: "📡" },
  { href: "/suggestions", label: "改善提案", en: "Suggestions", icon: "💡" },
  { href: "/directives", label: "実行指示", en: "Directives", icon: "📣" },
  { href: "/executions", label: "AI自動実行", en: "AI Executor", icon: "⚙" },
  { href: "/approvals", label: "承認待ち", en: "Approvals", icon: "✓" },
  { href: "/inbox", label: "問い合わせ受信箱", en: "CEO Inbox", icon: "📨" },
  { href: "/deliverables", label: "成果物レビュー", en: "AI Deliverables", icon: "🎁" },
  { href: "/notes", label: "社内連絡", en: "Notes", icon: "📝" },
  { href: "/notice", label: "スタッフへ連絡", en: "Staff Notice", icon: "📢" },
  { href: "/legal", label: "契約・法務", en: "Legal", icon: "📄" },
  { href: "/reserve", label: "予約申込", en: "Reserve", icon: "📅" },
  { href: "/library", label: "資料室", en: "Library", icon: "📁" },
  { href: "/network", label: "システム相関図", en: "System Network", icon: "🕸" },
  { href: "/memories", label: "経営メモ（AIの記憶）", en: "Business Memory", icon: "🧠" },
  { href: "/decisions", label: "決定事項ログ", en: "Decision Log", icon: "⚖" },
  { href: "/events", label: "出来事ログ", en: "Company Events", icon: "⚡" },
  { href: "/dev", label: "開発状況", en: "Development", icon: "🛠" },
  { href: "/future", label: "未来シミュレーション", en: "Future", icon: "📈" },
  { href: "/connectors", label: "外部連携", en: "Connectors", icon: "🔌" },
  { href: "/site-admin", label: "FRANKサイト管理", en: "Site CMS", icon: "🌐" },
  { href: "/vault", label: "システム台帳（ID/URL）", en: "Vault", icon: "🔐" },
  { href: "/accounts", label: "アカウント管理", en: "Accounts", icon: "👤" },
];

// mobile-nav 互換のため統合リストも維持
export const NAV = [...PRIMARY_NAV, ...ADMIN_NAV];

function itemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // チャット(/chat)は /command（CEO AI司令室タブ）でもアクティブ扱い（#78 §3-2統合）
  if (href === "/chat") return pathname.startsWith("/chat") || pathname.startsWith("/command");
  return pathname.startsWith(href);
}

function NavLink({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.en}
      className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-(--color-panel-2) text-sky-300 shadow-[inset_2px_0_0_0_#38bdf8]"
          : "text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt)"
      }`}
    >
      <span className="w-4 text-center text-xs">{item.icon}</span>
      {item.label}
    </Link>
  );
}

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const inAdmin = ADMIN_NAV.some((i) => itemActive(pathname, i.href));
  const [adminOpen, setAdminOpen] = useState(inAdmin);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-(--color-line) bg-(--color-panel) p-3 md:flex">
      <div className="mb-6 px-2 pt-2">
        <p className="text-xs tracking-[0.3em] text-(--color-gold)">YOZAN</p>
        <p className="text-lg font-bold tracking-wide">GENESIS</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={itemActive(pathname, item.href)} />
        ))}
        <button
          onClick={() => setAdminOpen((v) => !v)}
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt)"
        >
          <span className="w-4 text-center text-xs">{adminOpen ? "▾" : "▸"}</span>
          管理
        </button>
        {adminOpen &&
          ADMIN_NAV.map((item) => (
            <div key={item.href} className="pl-2">
              <NavLink item={item} active={itemActive(pathname, item.href)} />
            </div>
          ))}
      </nav>
      <div className="border-t border-(--color-line) px-2 pt-3 text-xs text-(--color-dim)">
        <p>{userName}</p>
        <form action="/api/logout" method="post">
          <button className="mt-1 text-(--color-dim) transition-colors hover:text-(--color-txt)">ログアウト</button>
        </form>
      </div>
    </aside>
  );
}
