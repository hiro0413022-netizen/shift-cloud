import type { ReactNode } from "react";

/** Survey OS 共通UIプリミティブ（Member OSと同方針の自作最小セット, DECISIONS #10） */

export function Panel({ title, children, action, className = "" }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={`hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2 text-sm font-semibold text-(--color-txt)">
              <span className="inline-block h-4 w-1 rounded-full bg-accent" />
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ok" | "warn" | "danger" | "accent" | "gold" }) {
  const tones = {
    default: "border-transparent bg-slate-100 text-slate-600",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    accent: "border-indigo-200 bg-indigo-50 text-indigo-700",
    gold: "border-yellow-200 bg-yellow-50 text-yellow-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-(--color-dim)">{children}</p>;
}

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "ok" | "gold" }) {
  const bar = tone === "ok" ? "bg-emerald-500" : tone === "gold" ? "bg-yellow-600" : "bg-indigo-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-(--color-panel-2)">
      <div className={`bar-grow h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const inputCls =
  "w-full rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";

export const btnCls =
  "inline-flex items-center gap-1 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center gap-1 rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-txt) transition-colors hover:bg-(--color-panel-2)";

export const STATUS_LABEL: Record<string, string> = { draft: "下書き", open: "公開中", closed: "終了" };
