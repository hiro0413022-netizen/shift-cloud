import type { ReactNode } from "react";
import Link from "next/link";

/*
 * 2026-09-28 ユーザー依頼「もっと操作しやすく・誰でも簡単にわかるUIに」
 *   - 白基調（globals.css）
 *   - 入力欄とボタンを大きく（指で押しやすい 44px 前後）
 *   - 欄には必ず「見出し（ラベル）」を付ける。placeholder だけの欄は、入れた瞬間に何の欄か分からなくなる
 */

export const inputCls =
  "w-full rounded-lg border border-(--color-line) bg-white px-3 py-2.5 text-base outline-none placeholder:text-slate-400 focus:border-(--color-gold) focus:ring-2 focus:ring-(--color-gold)/20 sm:text-sm";

export const btnCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-(--color-gold) px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 sm:text-sm";

export const btnGhostCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-(--color-line) bg-white px-4 py-2.5 text-base text-(--color-txt) hover:border-(--color-gold) hover:text-(--color-gold) sm:text-sm";

export const btnDangerCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-base text-(--color-accent) hover:bg-red-50 sm:text-sm";

export function Panel({ title, children, className = "", hint }: { title?: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-(--color-line) bg-(--color-panel) p-4 shadow-sm sm:p-5 ${className}`}>
      {title && <h2 className="text-base font-bold text-(--color-txt)">{title}</h2>}
      {hint && <p className="mt-0.5 text-sm text-(--color-dim)">{hint}</p>}
      {(title || hint) && <div className="mb-3" />}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "ok" | "accent" | "gold" | "warn" }) {
  const c: Record<string, string> = {
    dim: "border-(--color-line) bg-(--color-panel-2) text-(--color-dim)",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    accent: "border-red-200 bg-red-50 text-red-700",
    gold: "border-blue-200 bg-blue-50 text-blue-700",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${c[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-(--color-dim)">{children}</p>;
}

export function yen(n: number): string {
  return `${n < 0 ? "▲" : ""}${Math.abs(n).toLocaleString("ja-JP")}`;
}

/** 見出し付きの入力欄。hint は欄の下に出す一言（例: 「空なら自動で計算します」） */
export function Field({
  label,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center gap-1 text-sm font-medium text-(--color-txt)">
        {label}
        {required && <span className="rounded bg-red-50 px-1 text-[11px] font-bold text-red-600">必須</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-(--color-dim)">{hint}</span>}
    </label>
  );
}

/**
 * 画面の見出し。「この画面で何をするか」を1行で必ず書く（初めての人が迷わないように）。
 * right にはその画面で使う操作（月の切替など）を置く。
 */
export function PageHeader({
  title,
  lead,
  store,
  right,
}: {
  title: string;
  lead: ReactNode;
  store?: string | null;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
          {title}
          {store && <Badge>{store}</Badge>}
        </h1>
        <p className="mt-1 text-sm text-(--color-dim)">{lead}</p>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

/** 同じ仕事の中の画面の行き来（例: レジのお金 ＝ レジ締め／出し入れ） */
export function SubTabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-(--color-line) bg-white p-1" aria-label="この仕事の画面">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${
            t.key === current ? "bg-(--color-gold) text-white" : "text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt)"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** 「やり方」3ステップ。初めての人向けに画面の上へ小さく出す */
export function HowTo({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2 rounded-lg bg-(--color-gold-soft) px-3 py-2 text-sm text-blue-900">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--color-gold) text-xs font-bold text-white">
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** レジのお金（出し入れ・レジ締め）のサブタブ */
export const CASH_TABS = [
  { key: "count", href: "/count", label: "レジ締め（お金を数える）" },
  { key: "cash", href: "/cash", label: "出し入れの記録" },
];

/** 経費（入力・レシート）のサブタブ */
export const EXPENSE_TABS = [
  { key: "expense", href: "/expense", label: "経費を入れる" },
  { key: "receipts", href: "/receipts", label: "レシート・書類" },
];
