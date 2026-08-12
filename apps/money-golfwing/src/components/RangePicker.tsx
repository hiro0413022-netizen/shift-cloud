"use client";

import { useRouter } from "next/navigation";
import { inputCls, btnGhostCls } from "@/components/ui";
import type { RangePreset } from "@/lib/table-filter";

/**
 * 期間の切り替え。「今月だけ」では商品ごとの動きが見えないので、
 * 3か月・半年・今年・任意期間をワンタップで出せるようにする。
 * 選んだ期間はURLに残る（ブックマーク・共有できる）。
 */
const PRESETS: Array<{ value: RangePreset; label: string }> = [
  { value: "month", label: "当月" },
  { value: "3m", label: "3か月" },
  { value: "6m", label: "6か月" },
  { value: "year", label: "今年" },
  { value: "all", label: "全期間" },
  { value: "custom", label: "期間指定" },
];

export default function RangePicker({
  basePath = "/sales",
  month, preset, from, to,
}: {
  basePath?: string;
  month: string;
  preset: RangePreset;
  from: string | null;
  to: string | null;
}) {
  const router = useRouter();

  function go(next: Partial<{ preset: RangePreset; month: string; from: string; to: string }>) {
    const p = new URLSearchParams();
    const q = { preset, month, from: from ?? "", to: to ?? "", ...next };
    p.set("month", q.month);
    if (q.preset !== "month") p.set("range", q.preset);
    if (q.preset === "custom") {
      if (q.from) p.set("from", q.from);
      if (q.to) p.set("to", q.to);
    }
    router.push(`${basePath}?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => go({ preset: p.value })}
            className={
              p.value === preset
                ? "rounded-lg bg-(--color-gold) px-3 py-1.5 text-sm font-medium text-white"
                : `${btnGhostCls} !px-3 !py-1.5 !text-sm`
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="flex items-center gap-1">
          <input type="date" defaultValue={from ?? `${month}-01`} onChange={(e) => go({ from: e.target.value })} className={`${inputCls} !py-1.5`} aria-label="開始日" />
          <span className="text-sm text-(--color-dim)">〜</span>
          <input type="date" defaultValue={to ?? ""} onChange={(e) => go({ to: e.target.value })} className={`${inputCls} !py-1.5`} aria-label="終了日" />
        </div>
      ) : (
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && go({ month: e.target.value })}
          className={`${inputCls} !py-1.5`}
          aria-label="基準の月"
        />
      )}
    </div>
  );
}
