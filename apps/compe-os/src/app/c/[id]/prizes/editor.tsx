"use client";

import { useState, useTransition } from "react";
import type { Prize } from "@/lib/compe";
import { savePrizes } from "../actions";
import { btnCls, btnGhostCls, inputCls } from "@/components/ui";

type Draft = { id?: string; label: string; prize_name: string; winner_name: string };

export function PrizeEditor({ compId, prizes }: { compId: string; prizes: Prize[] }) {
  const [draft, setDraft] = useState<Draft[]>(
    prizes.map((p) => ({ id: p.id, label: p.label, prize_name: p.prize_name ?? "", winner_name: p.winner_name ?? "" }))
  );
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<Draft>) => setDraft((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <>
      <p className="mb-4 text-xs text-(--color-dim)">
        賞の名前と景品を入れます。表彰後に受賞者を書き込んでおくと、次回の「引き継いで作る」でも履歴として残ります。
      </p>
      <div className="space-y-2">
        {draft.map((p, i) => (
          <div key={p.id ?? `new-${i}`} className="grid gap-2 rounded-lg bg-(--color-panel-2) p-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
            <input value={p.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="賞の名前" className={`${inputCls} font-bold`} />
            <input value={p.prize_name} onChange={(e) => update(i, { prize_name: e.target.value })} placeholder="景品名" className={inputCls} />
            <input value={p.winner_name} onChange={(e) => update(i, { winner_name: e.target.value })} placeholder="受賞者（任意）" className={inputCls} />
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} className="rounded border border-(--color-line) bg-white px-2 py-1 text-xs">▲</button>
              <button type="button" onClick={() => move(i, 1)} className="rounded border border-(--color-line) bg-white px-2 py-1 text-xs">▼</button>
              <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="px-2 text-sm text-red-600">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setDraft((d) => [...d, { label: "✨ 特別賞", prize_name: "", winner_name: "" }])} className={btnGhostCls}>
          賞を追加
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void savePrizes(compId, draft);
            })
          }
          className={`${btnCls} ml-auto`}
        >
          {pending ? "保存中..." : "保存する"}
        </button>
      </div>
    </>
  );
}
