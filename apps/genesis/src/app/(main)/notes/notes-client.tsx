"use client";

import { useState, useTransition } from "react";
import { postMessage, resolveMessage } from "./actions";

export type NoteItem = {
  id: string;
  body: string;
  status: "open" | "done";
  reply: string | null;
  createdAt: string;
  from: string;
};

export function NotesClient({ items, myName }: { items: NoteItem[]; myName: string }) {
  const [draft, setDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "all">("open");
  const [pending, startTransition] = useTransition();

  const visible = tab === "open" ? items.filter((i) => i.status === "open") : items;

  return (
    <div className="space-y-6">
      {/* 記入 */}
      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
        <p className="mb-2 text-sm font-medium">連絡を書く（{myName}）</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="例: 宝塚店の空調が不調です。業者手配の判断をお願いします"
          className="w-full rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            disabled={pending || !draft.trim()}
            onClick={() =>
              startTransition(async () => {
                const r = await postMessage(draft);
                setMsg(r.error ?? "送信しました");
                if (!r.error) setDraft("");
              })
            }
            className="rounded-lg bg-sky-500/20 px-4 py-1.5 text-sm text-sky-300 disabled:opacity-40"
          >
            {pending ? "送信中…" : "送信"}
          </button>
          {msg && <span className="text-xs text-[--color-dim]">{msg}</span>}
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-1 rounded-lg border border-[--color-line] bg-[--color-panel] p-1 text-sm">
        <button
          onClick={() => setTab("open")}
          className={`flex-1 rounded-md py-1.5 ${tab === "open" ? "bg-[--color-panel-2] text-sky-300" : "text-[--color-dim]"}`}
        >
          未対応
        </button>
        <button
          onClick={() => setTab("all")}
          className={`flex-1 rounded-md py-1.5 ${tab === "all" ? "bg-[--color-panel-2] text-sky-300" : "text-[--color-dim]"}`}
        >
          すべて
        </button>
      </div>

      {/* 一覧 */}
      {visible.length === 0 && <p className="text-sm text-[--color-dim]">連絡はありません</p>}
      <div className="space-y-3">
        {visible.map((it) => (
          <div key={it.id} className={`rounded-xl border p-4 ${it.status === "open" ? "border-amber-400/40 bg-[--color-panel]" : "border-[--color-line] bg-[--color-panel] opacity-70"}`}>
            <div className="flex items-center gap-2 text-xs text-[--color-dim]">
              <span className="font-medium text-[--color-txt]">{it.from}</span>
              <span>{it.createdAt.slice(0, 16).replace("T", " ")}</span>
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${it.status === "open" ? "bg-amber-400/20 text-amber-300" : "bg-emerald-400/20 text-emerald-300"}`}>
                {it.status === "open" ? "未対応" : "対応済み"}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{it.body}</p>
            {it.reply && (
              <p className="mt-2 rounded-lg bg-[--color-panel-2] px-3 py-2 text-sm text-[--color-dim]">
                ↩ {it.reply}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              {it.status === "open" && (
                <input
                  value={replyDrafts[it.id] ?? ""}
                  onChange={(e) => setReplyDrafts({ ...replyDrafts, [it.id]: e.target.value })}
                  placeholder="返信メモ（任意）"
                  className="min-w-0 flex-1 rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-1.5 text-sm"
                />
              )}
              <button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await resolveMessage(it.id, replyDrafts[it.id]);
                  })
                }
                className="rounded-lg border border-[--color-line] px-3 py-1.5 text-sm text-[--color-dim] hover:text-[--color-txt] disabled:opacity-40"
              >
                {it.status === "open" ? "✓ 対応済みにする" : "未対応に戻す"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
