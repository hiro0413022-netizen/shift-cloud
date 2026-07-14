"use client";

import { useState, useTransition } from "react";
import { submitReport } from "./actions";

/** 日報・週報の記入フォーム（提出済みなら本文を初期表示し、再提出で上書き） */
export function ReportForm({ type, initialBody }: { type: "daily" | "weekly"; initialBody: string }) {
  const [body, setBody] = useState(initialBody);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder={
          type === "daily"
            ? "今日やったこと・気づき・共有事項など"
            : "今週の振り返り・来週やること・共有事項など"
        }
        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          disabled={pending || !body.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await submitReport(type, body);
              setMsg(r.error ? r.error : initialBody ? "更新しました" : "提出しました");
            })
          }
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "送信中…" : initialBody ? "更新する" : "提出する"}
        </button>
        {msg && <span className="text-xs text-zinc-400">{msg}</span>}
      </div>
    </div>
  );
}
