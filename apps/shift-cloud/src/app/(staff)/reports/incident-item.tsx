"use client";

import { useState, useTransition } from "react";
import { toggleIncidentResolved } from "./actions";

/**
 * 報告1件の「対応済みにする」操作。
 * 決着メモを一言だけ添えられるようにする（あとで分析するとき、何で終わったかが分かる）。
 */
export function IncidentItem({ id, resolved }: { id: string; resolved: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  if (resolved) {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(async () => { await toggleIncidentResolved(id, ""); })}
        className="text-xs text-zinc-400 underline disabled:opacity-40"
      >
        未対応に戻す
      </button>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md border border-zinc-200 px-3 py-1 text-xs text-zinc-600">
        対応済みにする
      </button>
    );
  }

  return (
    <div className="flex w-full gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="どう決着したか（任意）"
        className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs"
      />
      <button
        disabled={pending}
        onClick={() => startTransition(async () => { await toggleIncidentResolved(id, note); setOpen(false); })}
        className="shrink-0 rounded-md bg-brand px-3 py-1 text-xs text-white disabled:opacity-40"
      >
        完了
      </button>
      <button onClick={() => setOpen(false)} className="shrink-0 text-xs text-zinc-400">やめる</button>
    </div>
  );
}
