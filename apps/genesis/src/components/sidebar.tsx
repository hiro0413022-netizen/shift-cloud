"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// タブ名は「何ができるか」が分かる日本語（2026-07-13ユーザー要望）。enはツールチップ用の旧名
export const NAV = [
  { href: "/", label: "経営ダッシュボード", en: "Cockpit", icon: "◉" },
  { href: "/command", label: "CEO AI 司令室", en: "CEO AI Command", icon: "⌘" },
  { href: "/chat", label: "データに聞く", en: "Ask Data", icon: "💬" },
  { href: "/suggestions", label: "改善提案", en: "Suggestions", icon: "💡" },
  { href: "/directives", label: "実行指示", en: "Directives", icon: "📣" },
  { href: "/executions", label: "AI自動実行", en: "AI Executor", icon: "⚙" },
  { href: "/approvals", label: "承認待ち", en: "Approvals", icon: "✓" },
  { href: "/inbox", label: "問い合わせ受信箱", en: "CEO Inbox", icon: "📨" },
  { href: "/notes", label: "社内連絡", en: "Notes", icon: "📝" },
  { href: "/notice", label: "スタッフへ連絡", en: "Staff Notice", icon: "📢" },
  { href: "/finance", label: "財務（売上・利益）", en: "Finance", icon: "¥" },
  { href: "/legal", label: "契約・法務", en: "Legal", icon: "📄" },
  { href: "/reserve", label: "予約申込", en: "Reserve", icon: "📅" },
  { href: "/library", label: "資料室", en: "Library", icon: "📁" },
  { href: "/network", label: "システム相関図", en: "System Network", icon: "🕸" },
  { href: "/agents", label: "AI社員一覧", en: "AI Agents", icon: "🤖" },
  { href: "/deliverables", label: "成果物レビュー", en: "AI Deliverables", icon: "🎁" },
  { href: "/memories", label: "経営メモ（AIの記憶）", en: "Business Memory", icon: "🧠" },
  { href: "/decisions", label: "決定事項ログ", en: "Decision Log", icon: "⚖" },
  { href: "/events", label: "出来事ログ", en: "Company Events", icon: "⚡" },
  { href: "/dev", label: "開発状況", en: "Development", icon: "🛠" },
  { href: "/future", label: "未来シミュレーション", en: "Future", icon: "📈" },
  { href: "/connectors", label: "外部連携", en: "Connectors", icon: "🔌" },
  { href: "/vault", label: "システム台帳（ID/URL）", en: "Vault", icon: "🔐" },
];

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-(--color-line) bg-(--color-panel) p-3 md:flex">
      <div className="mb-6 px-2 pt-2">
        <p className="text-xs tracking-[0.3em] text-(--color-gold)">YOZAN</p>
        <p className="text-lg font-bold tracking-wide">GENESIS</p>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-emerald-300/80">
          <span className="blink inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          SYSTEM ONLINE
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.en}
              className={`relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                active
                  ? "bg-(--color-panel-2) text-sky-300 shadow-[inset_2px_0_0_0_#38bdf8]"
                  : "text-(--color-dim) hover:translate-x-0.5 hover:bg-(--color-panel-2) hover:text-(--color-txt)"
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
          <button className="mt-1 text-(--color-dim) transition-colors hover:text-(--color-txt)">ログアウト</button>
        </form>
      </div>
    </aside>
  );
}
