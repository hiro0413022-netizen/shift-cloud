// Night OS の最小UIプリミティブ（DECISIONS #10: shadcn相当を自作）
// 夜の現場はボーイもキャストも急いで触るので、押せるものは最低44px（デザイン案の約束）。

export const inputCls =
  "w-full rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-accent)";

export const btnCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-(--color-accent) px-4 text-sm font-bold text-white hover:bg-(--color-accent-2) disabled:opacity-50";

export const btnGhostCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-(--color-line) bg-white px-4 text-sm font-medium text-(--color-txt) hover:bg-(--color-panel-2) disabled:opacity-50";

export const btnDarkCls =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-(--color-txt) px-4 text-sm font-bold text-white disabled:opacity-50";

export const cardCls = "rounded-xl border border-(--color-line) bg-(--color-panel) p-4";

export function Yen({ value, className = "" }: { value: number; className?: string }) {
  const neg = value < 0;
  return (
    <span className={className}>
      {neg ? "−" : ""}¥{Math.abs(value).toLocaleString("ja-JP")}
    </span>
  );
}

export function Chip({
  children,
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "accent" | "gold" | "ok" | "warn";
}) {
  const tones = {
    plain: "bg-(--color-panel-2) text-(--color-dim)",
    accent: "bg-(--color-accent-soft) text-(--color-accent) font-medium",
    gold: "bg-(--color-gold-soft) text-(--color-gold) font-medium",
    ok: "bg-(--color-ok-soft) text-(--color-ok) font-medium",
    warn: "bg-(--color-warn-soft) text-(--color-warn) font-medium",
  } as const;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${tones[tone]}`}>{children}</span>;
}

export function Avatar({ name, tone = 0 }: { name: string; tone?: number }) {
  const palette = ["#9b3f50", "#8a6b25", "#57534e", "#a8a29e", "#3f6b4f"];
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] text-white"
      style={{ background: palette[tone % palette.length] }}
    >
      {name.slice(0, 2)}
    </span>
  );
}
