"use client";

import { useState, useTransition } from "react";
import { toggleTask, addTask } from "../calendar/actions";
import { TASK_SOURCE_LABEL } from "@/lib/task-scope";

export type TaskItem = {
  id: string;
  title: string;
  note?: string | null;
  status: "open" | "done";
  source: string;
  staff_id?: string | null; // null = 店舗共通タスク（予約申込など）
};

/**
 * 本日のやること（DECISIONS #48 / #55）。追加・完了チェックはその場で保存。
 * 店舗共通タスク（staff_id=null）は「店」バッジ付きで全員に表示され、誰か1人が完了すれば全員から消える。
 * 予約申込（source=reserve）は希望日時・連絡先を note に持つので、その場で開いて確認できるようにする。
 */
export function TasksCard({ today, tasks }: { today: string; tasks: TaskItem[] }) {
  const [draft, setDraft] = useState("");
  const [openNote, setOpenNote] = useState<string | null>(null);
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
        {tasks.map((t) => {
          const shared = !t.staff_id;
          const srcLabel = TASK_SOURCE_LABEL[t.source] ?? t.source;
          return (
            <div key={t.id} className="rounded-md px-1 py-0.5 hover:bg-zinc-50">
              <div className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={() => startTransition(async () => { await toggleTask(t.id); })}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-(--color-brand)"
                />
                <span className={`min-w-0 flex-1 ${t.status === "done" ? "text-zinc-300 line-through" : ""}`}>
                  {t.title}
                </span>
                {srcLabel && (
                  <span className="shrink-0 rounded bg-brand-light px-1 text-[10px] text-brand">{srcLabel}</span>
                )}
                {shared && (
                  <span className="shrink-0 rounded bg-zinc-100 px-1 text-[10px] text-zinc-500">店</span>
                )}
                {t.note && (
                  <button
                    onClick={() => setOpenNote(openNote === t.id ? null : t.id)}
                    className="shrink-0 text-[11px] text-zinc-400 underline"
                  >
                    {openNote === t.id ? "閉じる" : "詳細"}
                  </button>
                )}
              </div>
              {t.note && openNote === t.id && (
                <pre className="mt-1 ml-6 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-[12px] leading-relaxed text-zinc-600">
                  {t.note}
                </pre>
              )}
            </div>
          );
        })}
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
