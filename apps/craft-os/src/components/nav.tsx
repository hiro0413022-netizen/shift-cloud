import Link from "next/link";

/**
 * 伝票1件のタブ。
 * 表紙はここに無い。表紙は伝票と別物で、伝票が無くても存在するため（/f/[id]）。
 */
export const QUOTE_TABS = [
  { seg: "quote", label: "明細" },
  { seg: "work", label: "注文書・工房" },
];

export function QuoteNav({ id, active }: { id: number | string; active: string }) {
  return (
    <nav className="no-print -mx-1 mb-5 flex flex-wrap gap-1 border-b border-(--color-line) pb-2">
      {QUOTE_TABS.map((t) => {
        const on = active === t.seg;
        return (
          <Link
            key={t.seg}
            href={`/q/${id}/${t.seg}`}
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

export function TopNav({ active }: { active: "home" | "fittings" | "demo" }) {
  const items = [
    { href: "/", key: "home", label: "伝票・工房" },
    { href: "/f", key: "fittings", label: "フィッティング表紙" },
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
