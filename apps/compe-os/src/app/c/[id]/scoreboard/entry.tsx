"use client";

import { useMemo, useState, useTransition } from "react";
import { setDirectGross, setScoreNote } from "../actions";
import { buildScoreRows, formatHcp, formatNet, isPeria, type ScoreInput } from "@yozan/core/compe-score";
import { Badge } from "@/components/ui";

type P = { id: string; name: string; hcp: number | null; org: string | null };

export function GrossEntry({
  compId,
  format,
  participants,
  scores,
}: {
  compId: string;
  format: string;
  participants: P[];
  scores: Record<string, ScoreInput>;
}) {
  const [local, setLocal] = useState<Record<string, ScoreInput>>(scores);
  const [, startTransition] = useTransition();
  const peria = isPeria(format);

  const { ranked, noScore } = useMemo(
    () => buildScoreRows(participants, local, format),
    [participants, local, format]
  );
  const rankById = new Map(ranked.map((r) => [r.player.id, r]));

  const onGross = (pid: string, raw: string) => {
    const v = raw === "" ? null : Number.parseInt(raw, 10);
    setLocal((s) => ({ ...s, [pid]: { ...(s[pid] ?? {}), direct_gross: v } }));
    startTransition(() => {
      void setDirectGross(compId, pid, v == null || Number.isNaN(v) ? null : v);
    });
  };

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <>
      <p className="mb-3 text-xs text-(--color-dim)">
        GROSSを入れるとその場で順位が出ます。ホール別に入れた場合は、そちらの合計が使われます（GROSS欄が優先）。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-(--color-accent) text-left text-white">
              <th className="w-16 px-3 py-2 text-center">順位</th>
              <th className="px-3 py-2">氏名</th>
              <th className="px-3 py-2">所属</th>
              <th className="w-20 px-3 py-2 text-center">{peria ? "HCP(ペリア)" : "HCP"}</th>
              <th className="w-24 px-3 py-2 text-center">GROSS</th>
              <th className="w-20 px-3 py-2 text-center">NET</th>
              <th className="px-3 py-2">備考（ニアピン等）</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const row = rankById.get(p.id);
              const s = local[p.id];
              return (
                <tr key={p.id} className="border-b border-(--color-line)">
                  <td className="px-3 py-2 text-center text-lg font-bold">
                    {row?.rank ? (row.rank <= 3 ? medals[row.rank - 1] : `${row.rank}位`) : "—"}
                    {row?.tied && <div className="text-[10px] font-normal text-amber-700">同スコア</div>}
                  </td>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">{p.name}</td>
                  <td className="px-3 py-2 text-xs text-(--color-dim)">{p.org ?? ""}</td>
                  <td className="px-3 py-2 text-center">
                    {row ? formatHcp(row.hcp, peria, p.hcp) : peria ? "—" : (p.hcp ?? "—")}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      min={50}
                      max={200}
                      inputMode="numeric"
                      defaultValue={s?.direct_gross ?? ""}
                      placeholder={row && row.gross > 0 ? String(row.gross) : "GROSS"}
                      onChange={(e) => onGross(p.id, e.target.value)}
                      className="w-20 rounded-lg border-2 border-(--color-line) px-2 py-1 text-center font-bold focus:border-(--color-accent) focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-(--color-accent)">{formatNet(row?.net ?? null)}</td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={s?.note ?? ""}
                      placeholder="ニアピン・ドラコン等"
                      onBlur={(e) =>
                        startTransition(() => {
                          void setScoreNote(compId, p.id, e.target.value);
                        })
                      }
                      className="w-40 rounded border border-(--color-line) px-2 py-1 text-xs focus:border-(--color-accent) focus:outline-none"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-(--color-dim)">
        <Badge tone="ok">スコア入力済 {ranked.length}名</Badge>
        <Badge>未入力 {noScore.length}名</Badge>
        {ranked.some((r) => r.tied) && (
          <Badge tone="warn">同スコアの方がいます — 表彰順はマッチングカード等で決めてください</Badge>
        )}
      </div>
    </>
  );
}
