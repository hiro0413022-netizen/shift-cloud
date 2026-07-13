import type { ReactNode } from "react";

/** Reserve OS 共通UIプリミティブ（member-os / Genesis と同方針の最小セット） */

export function Panel({ title, children, action, className = "" }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={`hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2 text-sm font-semibold text-(--color-txt)">
              <span className="inline-block h-4 w-1 rounded-full bg-(--color-accent)" />
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

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ok" | "warn" | "danger" | "accent" }) {
  const tones = {
    default: "border-(--color-line) bg-(--color-panel-2) text-(--color-dim)",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    accent: "border-(--color-accent)/25 bg-(--color-accent)/8 text-(--color-accent)",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const inputCls =
  "w-full rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-accent)/15";

export const btnCls =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-(--color-accent) px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-accent-2) disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center gap-1 rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-txt) transition-colors hover:bg-(--color-panel-2)";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-(--color-dim)">{children}</p>;
}
