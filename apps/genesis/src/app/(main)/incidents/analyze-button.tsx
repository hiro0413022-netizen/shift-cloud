"use client";

import { useState, useTransition } from "react";
import { btnCls } from "@/components/ui";
import { analyzeNow } from "./actions";

/** 分析を手動実行（通常は毎朝6時のcronで自動。入れた直後に見たい時用） */
export function AnalyzeButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-(--color-dim)">{msg}</span>}
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMsg(null);
            const r = await analyzeNow();
            setMsg(r.error ?? r.message ?? null);
          })
        }
        className={`${btnCls} !py-1.5 text-xs`}
      >
        {pending ? "分析中…" : "今すぐ分析"}
      </button>
    </div>
  );
}
