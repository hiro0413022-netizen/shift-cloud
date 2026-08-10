"use client";

import { useState, useTransition } from "react";
import { Badge, inputCls } from "@/components/ui";
import { incidentCategoryLabel, INSIGHT_STATUS_LABEL } from "@yozan/core/incidents";
import { updateInsightStatus } from "./actions";

export type Insight = {
  id: string;
  title: string;
  pattern: string;
  cause: string | null;
  prevention: string;
  categories: string[];
  incident_count: number;
  status: string;
  status_note: string | null;
  generated_by: string;
  store_name: string | null;
  created_at: string;
};

/**
 * 再発防止策1件。読むだけで終わらせず「対応中→完了」を押せるようにする。
 * 押した記録が残るので、次の分析で同じ対策を作り直さない。
 */
export function InsightCard({ insight: i }: { insight: Insight }) {
  const [note, setNote] = useState(i.status_note ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const move = (status: string) => startTransition(async () => {
    await updateInsightStatus(i.id, status, note);
    setEditing(false);
  });

  const done = i.status === "done" || i.status === "dismissed";

  return (
    <div className={`rounded-lg border p-4 ${done ? "border-(--color-line) opacity-60" : "border-(--color-line) bg-(--color-panel)"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={i.status === "done" ? "ok" : i.status === "doing" ? "warn" : "danger"}>
          {INSIGHT_STATUS_LABEL[i.status] ?? i.status}
        </Badge>
        <p className="font-medium">{i.title}</p>
        <span className="ml-auto text-[10px] text-(--color-dim)">
          {i.generated_by === "ai" ? "AI分析" : i.generated_by === "rule" ? "自動集計" : "手動"}・報告{i.incident_count}件
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {i.categories.map((c) => (
          <span key={c} className="rounded bg-(--color-line) px-1.5 py-0.5 text-[10px]">{incidentCategoryLabel(c)}</span>
        ))}
        {i.store_name && <span className="rounded bg-(--color-line) px-1.5 py-0.5 text-[10px]">{i.store_name}</span>}
      </div>

      <p className="mt-2 text-sm text-(--color-dim)">{i.pattern}</p>
      {i.cause && (
        <p className="mt-1.5 text-sm">
          <span className="text-xs text-(--color-dim)">推定原因: </span>
          {i.cause}
        </p>
      )}
      <p className="mt-2 rounded-md bg-(--color-accent)/10 p-3 text-sm">
        <span className="text-xs font-medium text-(--color-accent)">やること: </span>
        {i.prevention}
      </p>

      {i.status_note && !editing && (
        <p className="mt-2 text-xs text-(--color-dim)">メモ: {i.status_note}</p>
      )}

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="メモ（どう対応したか・見送る理由など）"
            className={`${inputCls} text-sm`}
          />
          <div className="flex flex-wrap gap-2">
            <button disabled={pending} onClick={() => move("doing")} className="rounded-md border border-(--color-line) px-3 py-1 text-xs">対応中</button>
            <button disabled={pending} onClick={() => move("done")} className="rounded-md border border-(--color-line) px-3 py-1 text-xs">完了</button>
            <button disabled={pending} onClick={() => move("dismissed")} className="rounded-md border border-(--color-line) px-3 py-1 text-xs">見送り</button>
            <button disabled={pending} onClick={() => move("open")} className="rounded-md border border-(--color-line) px-3 py-1 text-xs">未着手に戻す</button>
            <button onClick={() => setEditing(false)} className="text-xs text-(--color-dim)">やめる</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="mt-3 text-xs text-(--color-dim) underline">
          状態を変える
        </button>
      )}
    </div>
  );
}
