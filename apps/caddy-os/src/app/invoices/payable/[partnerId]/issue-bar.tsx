"use client";

import { useState, useTransition } from "react";
import { issuePayableInvoice } from "../../../actions";

/** 支払請求書を発行して記録する（スナップショット保存 → 状態管理が可能になる） */
export function IssueBar({ partnerId, ym, issued }: { partnerId: string; ym: string; issued: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() =>
          start(async () => {
            const r = await issuePayableInvoice(partnerId, ym);
            setMsg(r.error ?? "記録しました");
          })
        }
        disabled={pending}
        className="rounded-lg bg-(--color-accent) px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? "記録中…" : issued ? "再発行して上書き" : "発行して記録"}
      </button>
      {msg ? <span className="text-xs text-(--color-dim)">{msg}</span> : null}
    </div>
  );
}
