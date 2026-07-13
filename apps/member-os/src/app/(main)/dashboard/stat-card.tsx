"use client";

import { useState } from "react";
import { CountUp } from "@/components/count-up";

export type StatItem = { name: string; sub?: string | null };
export type StatGroup = { key: string; label: string; count: number; tone?: Tone; items: StatItem[] };
type Tone = "indigo" | "emerald" | "rose" | "amber" | "slate";

const VALUE_TONE: Record<Tone, string> = {
  indigo: "text-indigo-600",
  emerald: "text-emerald-600",
  rose: "text-rose-600",
  amber: "text-amber-600",
  slate: "text-slate-800",
};
const CHIP_TONE: Record<Tone, string> = {
  indigo: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
  emerald: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  rose: "bg-rose-50 text-rose-700 hover:bg-rose-100",
  amber: "bg-amber-50 text-amber-700 hover:bg-amber-100",
  slate: "bg-slate-100 text-slate-700 hover:bg-slate-200",
};

export function StatCard({
  label,
  value,
  unit = "件",
  tone = "indigo",
  hint,
  groups = [],
}: {
  label: string;
  value: number;
  unit?: string;
  tone?: Tone;
  hint?: string;
  groups?: StatGroup[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const active = groups.find((g) => g.key === open) ?? null;

  return (
    <div className="hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
      <p className="text-sm font-medium text-(--color-dim)">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${VALUE_TONE[tone]}`}>
        <CountUp value={value} />
        <span className="ml-1 text-base font-medium text-(--color-dim)">{unit}</span>
      </p>
      {hint ? <p className="mt-1 text-xs text-(--color-dim)">{hint}</p> : null}

      {groups.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setOpen(open === g.key ? null : g.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  CHIP_TONE[g.tone ?? "slate"]
                } ${open === g.key ? "ring-2 ring-accent/30" : ""}`}
              >
                {g.label}
                <span className="tabular-nums opacity-70">{g.count}</span>
                <span className="opacity-50">{open === g.key ? "▲" : "▼"}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-(--color-line) bg-(--color-panel-2)">
              {active.items.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-(--color-dim)">対象なし</p>
              ) : (
                <ul className="divide-y divide-line">
                  {active.items.map((it, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="truncate font-medium text-(--color-txt)">{it.name}</span>
                      {it.sub ? <span className="shrink-0 text-xs text-(--color-dim)">{it.sub}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
