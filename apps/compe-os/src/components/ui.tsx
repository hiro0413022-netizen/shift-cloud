// 最小UIプリミティブ（DECISIONS #10の方針: shadcn/ui相当の自作）
export const inputCls =
  "w-full rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-accent)";

export const btnCls =
  "inline-flex items-center gap-2 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-accent-2) disabled:opacity-50";

export const btnGhostCls =
  "inline-flex items-center gap-2 rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm font-medium text-(--color-dim) hover:text-(--color-txt) disabled:opacity-50";

export const btnDangerCls =
  "inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50";

export const cardCls = "rounded-xl border border-(--color-line) bg-(--color-panel) p-6";

export const labelCls = "mb-1 block text-xs font-medium text-(--color-dim)";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function Badge({ tone = "gray", children }: { tone?: "gray" | "ok" | "warn" | "danger"; children: React.ReactNode }) {
  const map = {
    gray: "bg-(--color-panel-2) text-(--color-dim)",
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
  } as const;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${map[tone]}`}>{children}</span>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center text-(--color-dim)">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-xs">{hint}</p>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-(--color-line) pb-3">
      <h2 className="text-sm font-bold">{children}</h2>
      {right}
    </div>
  );
}
