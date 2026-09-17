"use client";
import { useCallback, useEffect, useState } from "react";

export function Toast({ msg, kind, onDone }: { msg: string; kind: "ok" | "err"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, kind === "ok" ? 2600 : 6000);
    return () => clearTimeout(t);
  }, [msg, kind, onDone]);
  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        className={`max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
          kind === "ok" ? "bg-navy text-white" : "bg-red-600 text-white"
        }`}
        role="status"
      >
        {msg}
      </div>
    </div>
  );
}

export function useToast() {
  const [t, setT] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const ok = useCallback((msg: string) => setT({ msg, kind: "ok" }), []);
  const err = useCallback((e: unknown) => setT({ msg: e instanceof Error ? e.message : String(e), kind: "err" }), []);
  const done = useCallback(() => setT(null), []);
  return { node: t ? <Toast msg={t.msg} kind={t.kind} onDone={done} /> : null, ok, err };
}

export function fmtDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
  return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}

export function Spinner({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-soft">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-soft border-t-transparent" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-soft">{children}</div>;
}

export type ToastApi = ReturnType<typeof useToast>;
