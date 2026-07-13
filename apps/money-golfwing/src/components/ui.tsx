import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-lg border border-(--color-line) bg-(--color-bg) px-3 py-2 text-sm outline-none focus:border-(--color-gold)";

export const btnCls =
  "inline-flex items-center gap-2 rounded-lg bg-(--color-gold) px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center gap-2 rounded-lg border border-(--color-line) px-3 py-2 text-sm text-(--color-txt) hover:border-(--color-gold)";

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-(--color-line) bg-(--color-panel) p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-(--color-dim)">{title}</h2>}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "ok" | "accent" | "gold" }) {
  const c: Record<string, string> = {
    dim: "border-(--color-line) text-(--color-dim)",
    ok: "border-(--color-ok) text-(--color-ok)",
    accent: "border-(--color-accent) text-(--color-accent)",
    gold: "border-(--color-gold) text-(--color-gold)",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${c[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-(--color-dim)">{children}</p>;
}

export function yen(n: number): string {
  return `${n < 0 ? "▲" : ""}${Math.abs(n).toLocaleString("ja-JP")}`;
}
