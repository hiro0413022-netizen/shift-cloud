import Link from "next/link";

/**
 * 「チャット」セクションのタブ（REDESIGN_2026-07 §3-2 / #78）
 * データに聞く(/chat) と CEO AI司令室(/command) を1つのセクションとして行き来できるようにする。
 */
export function ChatTabs({ active }: { active: "ask" | "command" }) {
  const tabs = [
    { key: "ask", href: "/chat", label: "データに聞く" },
    { key: "command", href: "/command", label: "CEO AIに相談・指示" },
  ] as const;
  return (
    <div className="mb-4 flex gap-1 rounded-lg border border-(--color-line) bg-(--color-panel) p-1 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`flex-1 rounded-md px-3 py-1.5 text-center transition-colors ${
            active === t.key
              ? "bg-(--color-panel-2) text-sky-300"
              : "text-(--color-dim) hover:text-(--color-txt)"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
