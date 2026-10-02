"use client";

import { useState, type ReactNode } from "react";

/** 「データに聞く」と「返信文をつくる」の切り替え（URLの ?tab=reply でも開ける） */
export function ChatTabs({
  initial,
  ask,
  reply,
}: {
  initial: "ask" | "reply";
  ask: ReactNode;
  reply: ReactNode;
}) {
  const [tab, setTab] = useState(initial);
  const items = [
    { k: "ask" as const, label: "データに聞く" },
    { k: "reply" as const, label: "返信文をつくる" },
  ];
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-zinc-200">
        {items.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => {
              setTab(t.k);
              try {
                const u = new URL(window.location.href);
                if (t.k === "reply") u.searchParams.set("tab", "reply");
                else u.searchParams.delete("tab");
                window.history.replaceState(null, "", u.toString());
              } catch {
                /* URL更新できなくても切替は効く */
              }
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.k ? "border-(--color-brand) font-semibold text-zinc-900" : "border-transparent text-zinc-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={tab === "ask" ? "" : "hidden"}>{ask}</div>
      <div className={tab === "reply" ? "" : "hidden"}>{reply}</div>
    </div>
  );
}
