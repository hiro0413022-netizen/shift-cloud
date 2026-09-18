"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTrialDemo } from "@/app/f/[id]/actions";

/**
 * 表紙（Fitting Report）の試打NO.欄。番号を打って Enter か欄を離れると、その行だけすぐ保存して
 * シャフト名・メーカー・定価を出す（【保存する】を押さなくても出る）。
 * name を付けているので、【保存する】で送っても同じ値が入る（二重でも結果は同じ）。
 */
export function DemoNoInput({ fittingId, lineNo, defaultValue }: { fittingId: number; lineNo: number; defaultValue: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const last = useRef(defaultValue == null ? "" : String(defaultValue));

  function commit(el: HTMLInputElement) {
    const v = el.value.normalize("NFKC").trim();
    if (v === last.current) return;
    last.current = v;
    setMsg(null);
    start(async () => {
      const r = await setTrialDemo(fittingId, lineNo, v);
      if (!r.ok && r.message) setMsg(r.message);
      router.refresh();
    });
  }

  return (
    <span className="relative block">
      <input
        name={`demo_${lineNo}`}
        defaultValue={defaultValue ?? ""}
        inputMode="numeric"
        placeholder="番号"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget);
            // 次の行の試打NO.へ
            const next = e.currentTarget.form?.elements.namedItem(`demo_${lineNo + 1}`);
            if (next instanceof HTMLInputElement) next.focus();
          }
        }}
        onBlur={(e) => commit(e.currentTarget)}
        className={`w-full rounded-sm border bg-white px-0.5 text-center outline-none placeholder:text-gray-300 focus:border-sky-600 ${
          msg ? "border-red-400" : "border-gray-300"
        } ${pending ? "opacity-50" : ""}`}
        title={msg ?? "試打NOを入れて Enter で、シャフト名・メーカー・定価が出ます"}
      />
      {msg && (
        <span className="no-print absolute left-0 top-full z-10 mt-0.5 w-56 rounded bg-red-600 px-1.5 py-0.5 text-left text-[10px] leading-tight text-white shadow">
          {msg}
        </span>
      )}
    </span>
  );
}
