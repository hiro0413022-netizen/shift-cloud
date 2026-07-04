import type { ReactNode } from "react";

/** Genesis共通UIプリミティブ（DECISIONS #10と同方針の自作最小セット） */

export function Panel({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold tracking-wide text-[--color-dim]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS_COLORS: Record<string, string> = {
  // 汎用状態 → 色（MASTER_PROMPT 9-2）
  normal: "bg-emerald-400",
  active: "bg-sky-400",
  processing: "bg-sky-400",
  warning: "bg-amber-400",
  danger: "bg-red-400",
  completed: "bg-emerald-400",
  approval_required: "bg-purple-400",
  planned: "bg-zinc-500",
  live: "bg-emerald-400",
  building: "bg-sky-400",
  designing: "bg-indigo-400",
  testing: "bg-amber-400",
  paused: "bg-zinc-500",
  idle: "bg-zinc-500",
  working: "bg-sky-400",
  waiting_approval: "bg-purple-400",
  error: "bg-red-400",
  open: "bg-amber-400",
  mitigated: "bg-emerald-400",
  resolved: "bg-emerald-400",
  done: "bg-emerald-400",
  blocked: "bg-red-400",
  pending: "bg-purple-400",
};

export function StatusDot({ status }: { status: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[status] ?? "bg-zinc-500"}`} />;
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ok" | "warn" | "danger" | "accent" | "gold" }) {
  const tones = {
    default: "border-[--color-line] text-[--color-dim]",
    ok: "border-emerald-500/40 text-emerald-300",
    warn: "border-amber-500/40 text-amber-300",
    danger: "border-red-500/40 text-red-300",
    accent: "border-sky-500/40 text-sky-300",
    gold: "border-yellow-600/50 text-[--color-gold]",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function severityTone(sev: string): "ok" | "warn" | "danger" | "default" {
  if (sev === "critical" || sev === "high") return "danger";
  if (sev === "medium" || sev === "warning") return "warn";
  return "default";
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[--color-panel-2]">
      <div
        className={`h-full rounded-full ${value >= 100 ? "bg-emerald-400" : "bg-sky-400"}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-[--color-dim]">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm text-[--color-txt] placeholder:text-[--color-dim]/60 focus:border-sky-500 focus:outline-none";

export const btnCls =
  "inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center gap-1 rounded-lg border border-[--color-line] px-3 py-2 text-sm text-[--color-dim] hover:text-[--color-txt] hover:border-sky-700";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[--color-dim]">{children}</p>;
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
