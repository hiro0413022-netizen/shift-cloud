"use client";

import { useActionState, useState } from "react";
import { unlockVault } from "./actions";
import { inputCls, btnCls } from "@/components/ui";

export function UnlockForm() {
  const [state, action, pending] = useActionState(unlockVault, {});
  return (
    <form action={action} className="mx-auto mt-16 flex w-72 flex-col gap-3 text-center">
      <p className="text-3xl">🔐</p>
      <p className="text-sm text-[--color-dim]">
        システム台帳はパスワードで保護されています
      </p>
      <input
        type="password"
        name="password"
        placeholder="Vaultパスワード"
        className={inputCls}
        autoFocus
        required
      />
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      <button className={btnCls} disabled={pending}>
        {pending ? "確認中…" : "ロック解除"}
      </button>
    </form>
  );
}

export function SecretCell({ value }: { value: string | null }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-[--color-dim]">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs">{show ? value : "••••••••"}</span>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="text-xs text-[--color-dim] hover:text-[--color-txt]"
        title={show ? "隠す" : "表示"}
      >
        {show ? "🙈" : "👁"}
      </button>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-xs text-[--color-dim] hover:text-[--color-txt]"
        title="コピー"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}
