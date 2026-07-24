"use client";

import { useState, useTransition } from "react";
import { issueReceivableInvoice } from "../actions";

/** 受取請求書を発行して記録（状態管理を可能にする） */
export function IssueReceivable({ clientId, ym, issued }: { clientId: string; ym: string; issued: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() =>
          start(async () => {
            const r = await issueReceivableInvoice(clientId, ym);
            setMsg(r.error ?? "✓");
          })
        }
        disabled={pending}
        className="rounded-lg border border-(--color-line) px-2 py-1 text-[11px] disabled:opacity-50"
        title="発行して記録"
      >
        {pending ? "…" : issued ? "再記録" : "記録"}
      </button>
      {msg ? <span className="text-[10px] text-(--color-dim)">{msg}</span> : null}
    </span>
  );
}
