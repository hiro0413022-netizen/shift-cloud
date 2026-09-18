"use client";

import { useState, useTransition } from "react";
import { addTasksForWork } from "@/app/q/[id]/flow-actions";
import type { AddTasksResult } from "@/lib/work-tasks";

/** 【やることリストに追加】— 押したら工房の段取りを店舗の「やること」（Shift Cloud）に入れる */
export function AddTasksButton({ quoteId, small = false }: { quoteId: number; small?: boolean }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<AddTasksResult | null>(null);
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setR(await addTasksForWork(quoteId));
            } catch (e) {
              setR({ ok: false, message: e instanceof Error ? e.message : "追加できませんでした", added: [], skipped: [] });
            }
          })
        }
        className={
          small
            ? "rounded-lg border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        }
      >
        {pending ? "追加しています…" : "やることリストに追加"}
      </button>
      {r && (
        <p className={`text-xs ${r.ok ? "text-emerald-700" : "text-red-600"}`}>
          {r.message ??
            (r.added.length
              ? `追加しました：${r.added.join("・")}`
              : "追加するものはありませんでした（もう入っているか、終わっています）")}
        </p>
      )}
    </div>
  );
}
