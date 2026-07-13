import type { ReactNode } from "react";
import { CountUp } from "./count-up";

/** Genesis共通UIプリミティブ（DECISIONS #10と同方針の自作最小セット） */

export function Panel({ title, children, action, className = "" }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={`hud reveal rounded-xl border border-(--color-line) bg-(--color-panel) p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && (
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-(--color-dim)">
              <span className="inline-block h-3 w-0.5 rounded-full bg-(--color-accent)" />
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
    default: "border-(--color-line) text-(--color-dim)",
    ok: "border-emerald-500/40 text-emerald-300",
    warn: "border-amber-500/40 text-amber-300",
    danger: "border-red-500/40 text-red-300",
    accent: "border-sky-500/40 text-sky-300",
    gold: "border-yellow-600/50 text-(--color-gold)",
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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--color-panel-2)">
      <div
        className={`bar-grow h-full rounded-full ${value >= 100 ? "bg-emerald-400" : "bg-sky-400"}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-(--color-dim)">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-sky-500 focus:outline-none";

export const btnCls =
  "inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-sky-500 hover:shadow-[0_0_16px_-2px_rgba(56,189,248,0.6)] disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center gap-1 rounded-lg border border-(--color-line) px-3 py-2 text-sm text-(--color-dim) transition-colors hover:text-(--color-txt) hover:border-sky-700";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-(--color-dim)">{children}</p>;
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ============================================================
   KPI表示（実データ: trend jsonb → スパークライン＋カウントアップ）
   ============================================================ */

type TrendPoint = { date: string; value: number };

export function parseTrend(trend: unknown): TrendPoint[] {
  if (!Array.isArray(trend)) return [];
  return trend
    .filter((p): p is TrendPoint => p != null && typeof p === "object" && "value" in (p as object))
    .map((p) => ({ date: String(p.date ?? ""), value: Number(p.value) }))
    .filter((p) => Number.isFinite(p.value));
}

/** SVGスパークライン（サーバーレンダリング可） */
export function Sparkline({ trend, tone = "accent" }: { trend: unknown; tone?: "accent" | "gold" | "ok" }) {
  const pts = parseTrend(trend);
  if (pts.length === 0) return <div className="h-7" />;
  const points = pts.length === 1 ? [pts[0], pts[0]] : pts;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 100;
  const H = 28;
  const pad = 3;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (W - pad * 2);
    const y = H - pad - ((p.value - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  const poly = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = coords[coords.length - 1];
  const stroke = tone === "gold" ? "#d4af37" : tone === "ok" ? "#34d399" : "#38bdf8";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={poly} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <circle cx={lx} cy={ly} r="2" fill={stroke} />
    </svg>
  );
}

/** KPIカード（値カウントアップ＋スパークライン） */
export function KpiCard({
  name,
  value,
  unit,
  trend,
  target,
  note,
}: {
  name: string;
  value: number | null;
  unit: string;
  trend?: unknown;
  target?: number | null;
  note?: string | null;
}) {
  return (
    <div className="hud reveal rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
      <p className="text-xs tracking-wide text-(--color-dim)">{name}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {value != null ? (
          <>
            <CountUp value={value} />
            <span className="ml-0.5 text-sm font-medium text-(--color-dim)">{unit}</span>
          </>
        ) : (
          <span className="text-base font-medium text-(--color-dim)">— 未接続</span>
        )}
      </p>
      {value != null && <Sparkline trend={trend} />}
      <p className="mt-1 truncate text-[11px] text-(--color-dim)" title={note ?? undefined}>
        {target != null ? `目標 ${Number(target).toLocaleString("ja-JP")}${unit}` : (note ?? "")}
      </p>
    </div>
  );
}
