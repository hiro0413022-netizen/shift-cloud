"use client";

import { useState, useTransition } from "react";
import type { Team } from "@/lib/compe";
import { saveTeams } from "../actions";
import { btnCls, btnGhostCls, inputCls } from "@/components/ui";

type Draft = { id?: string; name: string; group_name: string; score: number | null; rank_label: string; note: string; members: string };

export function TeamEditor({ compId, teams }: { compId: string; teams: Team[] }) {
  const [draft, setDraft] = useState<Draft[]>(
    teams.map((t) => ({
      id: t.id,
      name: t.name,
      group_name: t.group_name ?? "",
      score: t.score,
      rank_label: t.rank_label ?? "",
      note: t.note ?? "",
      members: t.members ?? "",
    }))
  );
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<Draft>) =>
    setDraft((d) => d.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const autoRank = () =>
    setDraft((d) => {
      const scored = d.filter((t) => t.score != null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
      const rankById = new Map(scored.map((t, i) => [t, `${i + 1}位`]));
      return d.map((t) => (rankById.has(t) ? { ...t, rank_label: rankById.get(t) as string } : t));
    });

  return (
    <>
      <div className="space-y-3">
        {draft.map((t, i) => (
          <div key={t.id ?? `new-${i}`} className="grid gap-2 rounded-lg bg-(--color-panel-2) p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_2fr_auto]">
            <input value={t.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="チーム名" className={`${inputCls} font-bold`} />
            <input value={t.group_name} onChange={(e) => update(i, { group_name: e.target.value })} placeholder="組名" className={inputCls} />
            <input
              type="number"
              value={t.score ?? ""}
              onChange={(e) => update(i, { score: e.target.value === "" ? null : Number.parseInt(e.target.value, 10) })}
              placeholder="スコア"
              className={`${inputCls} text-center`}
            />
            <input value={t.rank_label} onChange={(e) => update(i, { rank_label: e.target.value })} placeholder="順位" className={`${inputCls} text-center`} />
            <input value={t.members} onChange={(e) => update(i, { members: e.target.value })} placeholder="メンバー（・区切り）" className={inputCls} />
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} className="rounded border border-(--color-line) bg-white px-2 py-1 text-xs">▲</button>
              <button type="button" onClick={() => move(i, 1)} className="rounded border border-(--color-line) bg-white px-2 py-1 text-xs">▼</button>
              <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="px-2 text-sm text-red-600">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDraft((d) => [...d, { name: `チーム${d.length + 1}`, group_name: "", score: null, rank_label: "", note: "", members: "" }])}
          className={btnGhostCls}
        >
          チームを追加
        </button>
        <button type="button" onClick={autoRank} className={btnGhostCls}>
          スコア順に順位をつける
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void saveTeams(compId, draft);
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
