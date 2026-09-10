"use client";

import { useState, useTransition } from "react";
import type { Group, Participant } from "@/lib/compe";
import { deleteGroup, moveMember, updateGroup } from "../actions";
import { cardCls } from "@/components/ui";

export function GroupingBoard({
  compId,
  participants,
  groups,
  teeOptions,
}: {
  compId: string;
  participants: Participant[];
  groups: Group[];
  teeOptions: string[];
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | "none" | null>(null);
  const [, startTransition] = useTransition();

  const byId = new Map(participants.map((p) => [p.id, p]));
  const assigned = new Set(groups.flatMap((g) => g.members.map((m) => m.participant_id)));
  const unassigned = participants.filter((p) => !assigned.has(p.id));

  const drop = (groupId: string | null) => {
    if (!dragging) return;
    const pid = dragging;
    setDragging(null);
    setOverGroup(null);
    startTransition(() => {
      void moveMember(compId, pid, groupId);
    });
  };

  return (
    <>
      {unassigned.length > 0 && (
        <div
          className={`mb-5 rounded-xl border-2 border-dashed p-4 ${
            overGroup === "none" ? "border-(--color-accent) bg-emerald-50" : "border-amber-300 bg-amber-50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setOverGroup("none");
          }}
          onDragLeave={() => setOverGroup(null)}
          onDrop={() => drop(null)}
        >
          <p className="mb-2 text-sm font-bold text-amber-800">未割当（{unassigned.length}名）</p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <Chip key={p.id} participant={p} onDragStart={() => setDragging(p.id)} />
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className={`${cardCls} text-center text-sm text-(--color-dim)`}>
          まだ組がありません。「HCP順で自動割り振り」を押すか、「組を追加」から手で作ってください。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.id}
              className={`overflow-hidden rounded-xl border-2 bg-white ${
                overGroup === g.id ? "border-(--color-accent)" : "border-(--color-line)"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setOverGroup(g.id);
              }}
              onDragLeave={() => setOverGroup(null)}
              onDrop={() => drop(g.id)}
            >
              <div className="flex flex-wrap items-center gap-2 bg-(--color-accent) px-3 py-2 text-white">
                <input
                  defaultValue={g.name}
                  onBlur={(e) =>
                    startTransition(() => {
                      void updateGroup(compId, g.id, { name: e.target.value });
                    })
                  }
                  className="w-20 rounded bg-white/20 px-2 py-1 text-sm font-bold text-white placeholder-white/60"
                />
                <select
                  defaultValue={g.tee ?? teeOptions[0] ?? ""}
                  onChange={(e) =>
                    startTransition(() => {
                      void updateGroup(compId, g.id, { tee: e.target.value });
                    })
                  }
                  className="rounded bg-white/20 px-1 py-1 text-xs text-white"
                >
                  {teeOptions.map((t) => (
                    <option key={t} value={t} className="text-(--color-txt)">
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  defaultValue={g.start_time ?? ""}
                  placeholder="--:--"
                  onBlur={(e) =>
                    startTransition(() => {
                      void updateGroup(compId, g.id, { start_time: e.target.value });
                    })
                  }
                  className="w-16 rounded bg-white/20 px-1 py-1 text-center text-xs text-white placeholder-white/60"
                />
                <form action={deleteGroup} className="ml-auto">
                  <input type="hidden" name="comp_id" value={compId} />
                  <input type="hidden" name="group_id" value={g.id} />
                  <button className="rounded bg-white/20 px-2 py-1 text-xs">✕</button>
                </form>
              </div>
              <div className="min-h-24 space-y-1 p-2">
                {g.members.length === 0 && (
                  <p className="py-6 text-center text-xs text-(--color-dim)">ここにドラッグして入れる</p>
                )}
                {g.members.map((m, i) => {
                  const p = byId.get(m.participant_id);
                  if (!p) return null;
                  return (
                    <div
                      key={m.participant_id}
                      draggable
                      onDragStart={() => setDragging(p.id)}
                      className="flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-(--color-panel-2)"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--color-accent) text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm font-semibold">{p.name}</span>
                      {p.hcp != null && <span className="text-xs text-(--color-dim)">HCP {p.hcp}</span>}
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(() => {
                            void moveMember(compId, p.id, null);
                          })
                        }
                        className="text-xs text-(--color-dim) hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-(--color-dim)">
        メンバーはドラッグ＆ドロップで組を移せます。同じ人が2つの組に入ることはデータベース側で禁止しているので、
        移動の取りこぼしで人数が合わなくなることはありません。
      </p>
    </>
  );
}

function Chip({ participant, onDragStart }: { participant: Participant; onDragStart: () => void }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex cursor-grab items-center gap-2 rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
    >
      <span className="font-semibold">{participant.name}</span>
      {participant.hcp != null && <span className="text-xs text-(--color-dim)">HCP {participant.hcp}</span>}
    </div>
  );
}
