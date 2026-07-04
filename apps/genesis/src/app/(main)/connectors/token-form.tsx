"use client";

import { useActionState } from "react";
import { issueWebhookToken } from "./actions";
import { btnGhostCls } from "@/components/ui";

export function TokenForm({ connectorId }: { connectorId: string }) {
  const [state, action, pending] = useActionState(issueWebhookToken, {});

  return (
    <div>
      <form action={action}>
        <input type="hidden" name="id" value={connectorId} />
        <button disabled={pending} className={btnGhostCls}>
          {pending ? "発行中..." : "Webhookトークン発行"}
        </button>
      </form>
      {state.token && (
        <div className="mt-2 rounded border border-amber-600/40 bg-amber-950/30 p-2 text-xs">
          <p className="text-amber-300">このトークンは今だけ表示されます（再表示不可）:</p>
          <code className="block break-all py-1 text-amber-100">{state.token}</code>
          <p className="text-[--color-dim]">
            Webhook URL: /api/webhooks/{state.connector}?token=（上記トークン）
          </p>
        </div>
      )}
      {state.error && <p className="mt-1 text-xs text-red-400">{state.error}</p>}
    </div>
  );
}
