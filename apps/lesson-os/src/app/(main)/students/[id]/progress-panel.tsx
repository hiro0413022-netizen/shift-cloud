"use client";

import { useState, useTransition } from "react";
import { Radar } from "@/components/radar";
import { saveProgress } from "./actions";

/**
 * カリキュラム進捗（PGA NOTE「レッスン目標」9項目スライダー＋レーダーチャート準拠）
 */
export type ProgressItem = { itemId: string; name: string; percent: number };

export function ProgressPanel({ studentId, items }: { studentId: string; items: ProgressItem[] }) {
  const [values, setValues] = useState<ProgressItem[]>(items);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (itemId: string, percent: number) =>
    setValues((prev) => prev.map((v) => (v.itemId === itemId ? { ...v, percent } : v)));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
        <p className="mb-2 text-sm font-medium text-(--color-gold)">進捗率</p>
        <Radar items={values.map((v) => ({ name: v.name, percent: v.percent }))} />
      </div>
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
        <p className="mb-3 text-sm font-medium text-(--color-gold)">レッスン目標（達成度）</p>
        <div className="space-y-3">
          {values.map((v) => (
            <div key={v.itemId}>
              <div className="flex items-center justify-between text-xs">
                <span>{v.name}</span>
                <span className="flex items-center gap-1.5">
                  <button onClick={() => set(v.itemId, Math.max(0, v.percent - 10))} className="btn-ghost !px-2 !py-0.5">−</button>
                  <span className="w-10 text-center font-semibold">{v.percent}%</span>
                  <button onClick={() => set(v.itemId, Math.min(100, v.percent + 10))} className="btn-ghost !px-2 !py-0.5">＋</button>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={v.percent}
                onChange={(e) => set(v.itemId, Number(e.target.value))}
                className="mt-1 w-full accent-(--color-active)"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveProgress(studentId, values.map((v) => ({ itemId: v.itemId, percent: v.percent })));
                setMsg(r.error ?? "保存しました");
              })
            }
            className="btn-gold"
          >
            {pending ? "保存中…" : "登録"}
          </button>
          {msg && <span className="text-xs text-(--color-dim)">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
