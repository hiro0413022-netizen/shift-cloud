import Link from "next/link";

/** 見積1件のタブ。紙の流れ（表紙 → 見積書 → 注文書・工房）と同じ順に並べる */
export const QUOTE_TABS = [
  { seg: "", label: "フィッティング表紙" },
  { seg: "quote", label: "見積" },
  { seg: "work", label: "注文書・工房" },
];

export function QuoteNav({ id, active }: { id: number | string; active: string }) {
  return (
    <nav className="no-print -mx-1 mb-5 flex flex-wrap gap-1 border-b border-(--color-line) pb-2">
      {QUOTE_TABS.map((t) => {
        const href = t.seg ? `/q/${id}/${t.seg}` : `/q/${id}`;
        const on = active === t.seg;
        return (
          <Link
            key={t.seg || "home"}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              on ? "bg-(--color-accent) font-semibold text-white" : "text-(--color-dim) hover:bg-(--color-panel-2)"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TopNav({ active }: { active: "home" | "demo" }) {
  const items = [
    { href: "/", key: "home", label: "見積・工房" },
    { href: "/demo-shafts", key: "demo", label: "試打シャフト台帳" },
  ] as const;
  return (
    <nav className="no-print mb-5 flex gap-1">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            active === i.key ? "bg-(--color-accent) font-semibold text-white" : "text-(--color-dim) hover:bg-(--color-panel-2)"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
