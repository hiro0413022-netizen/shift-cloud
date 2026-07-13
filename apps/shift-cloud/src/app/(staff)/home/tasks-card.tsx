"use client";

import { useState, useTransition } from "react";
import { toggleTask, addTask } from "../calendar/actions";

export type TaskItem = { id: string; title: string; status: "open" | "done"; source: string };

/** 本日のやること（DECISIONS #48）。追加・完了チェックはその場で保存 */
export function TasksCard({ today, tasks }: { today: string; tasks: TaskItem[] }) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const open = tasks.filter((t) => t.status === "open").length;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-500">今日のやること</p>
        {tasks.length > 0 && (
          <span className={`text-xs ${open === 0 ? "text-brand" : "text-zinc-400"}`}>
            {open === 0 ? "すべて完了 🎉" : `残り ${open} 件`}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {tasks.length === 0 && <p className="text-sm text-zinc-400">今日のタスクはありません</p>}
        {tasks.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={() => startTransition(async () => { await toggleTask(t.id); })}
              className="h-4 w-4 accent-(--color-brand)"
            />
            <span className={t.status === "done" ? "text-zinc-300 line-through" : ""}>{t.title}</span>
            {t.source !== "manual" && (
              <span className="rounded bg-brand-light px-1 text-[10px] text-brand">{t.source === "manager" ? "店長" : "AI"}</span>
            )}
          </label>
        ))}
        <div className="flex gap-2 pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="やることを追加"
            className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
          />
          <button
            disabled={pending || !draft.trim()}
            onClick={() =>
              startTransition(async () => {
                const r = await addTask(today, draft);
                if (!r.error) setDraft("");
              })
            }
            className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
