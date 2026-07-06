"use client";

import { useState } from "react";
import { openPeriod } from "./actions";
import { Button } from "@/components/ui";

const TYPES = [
  { value: "month", label: "1ヶ月" },
  { value: "half1", label: "前半(1〜15日)" },
  { value: "half2", label: "後半(16〜末日)" },
  { value: "custom", label: "期間を指定" },
] as const;

export function PeriodForm({ ym, storeId }: { ym: string; storeId: string }) {
  const [type, setType] = useState<string>("month");

  return (
    <form action={openPeriod} className="flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-3">
      <input type="hidden" name="target_month" value={ym} />
      <input type="hidden" name="store_id" value={storeId} />

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500">募集の単位</label>
        <div className="flex gap-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
                type === t.value ? "border-brand bg-brand-light font-medium text-brand" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <input type="hidden" name="period_type" value={type} />

      {type === "custom" && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">開始日</label>
            <input name="start_date" type="date" required defaultValue={`${ym}-01`}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">終了日</label>
            <input name="end_date" type="date" required defaultValue={`${ym}-15`}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500">ラベル（任意）</label>
        <input name="title" placeholder="例: 7月前半"
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500">提出の締切日</label>
        <input name="deadline" type="date" required
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
      </div>

      <Button type="submit">募集を開始</Button>
    </form>
  );
}
