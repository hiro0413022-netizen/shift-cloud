// 最小UIプリミティブ（DECISIONS #10の方針: shadcn/ui相当の自作）
export const inputCls =
  "w-full rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-accent)";

export const btnCls =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-accent-2) disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-txt) hover:bg-(--color-panel-2) disabled:opacity-50";

export const btnDangerCls =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-(--color-danger) hover:bg-red-50 disabled:opacity-50";

export const cardCls = "rounded-xl border border-(--color-line) bg-(--color-panel) p-5";

const LEVEL_TONE: Record<string, string> = {
  L1: "bg-slate-100 text-slate-700 border-slate-200",
  L2: "bg-amber-50 text-amber-800 border-amber-200",
  L3: "bg-rose-50 text-rose-800 border-rose-200",
};

export function LevelBadge({ level }: { level: string }) {
  const label = level === "L1" ? "L1 通常" : level === "L2" ? "L2 社外秘" : "L3 秘匿";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_TONE[level] ?? LEVEL_TONE.L1}`}>
      {label}
    </span>
  );
}

export function Pill({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "ok" | "warn" | "danger" | "accent" }) {
  const cls = {
    dim: "bg-(--color-panel-2) text-(--color-dim)",
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    accent: "bg-indigo-50 text-indigo-700",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}
