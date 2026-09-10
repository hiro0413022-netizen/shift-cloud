"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SIZES = [
  ["a4", "A4"],
  ["a3", "A3"],
  ["a2", "A2"],
  ["a1", "A1"],
] as const;

/**
 * 印刷ツールバー（画面にだけ出る）。
 * 用紙サイズ・向きはURLのクエリで持つ ＝ 同じ設定のURLをそのまま共有・再印刷できる。
 */
export function PrintToolbar({ showTheme = false }: { showTheme?: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const size = sp.get("size") ?? "a4";
  const orient = sp.get("orient") ?? "portrait";
  const theme = sp.get("theme") ?? "green";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set(key, value);
    router.replace(`?${next.toString()}`);
  };

  return (
    <div className="no-print sticky top-0 z-10 mb-6 flex flex-wrap items-center gap-3 border-b border-(--color-line) bg-(--color-panel) px-4 py-3">
      <span className="text-xs text-(--color-dim)">用紙</span>
      {SIZES.map(([v, label]) => (
        <button
          key={v}
          onClick={() => set("size", v)}
          className={`rounded px-2 py-1 text-xs ${size === v ? "bg-(--color-accent) text-white" : "border border-(--color-line)"}`}
        >
          {label}
        </button>
      ))}
      <span className="ml-3 text-xs text-(--color-dim)">向き</span>
      {[
        ["portrait", "縦"],
        ["landscape", "横"],
      ].map(([v, label]) => (
        <button
          key={v}
          onClick={() => set("orient", v)}
          className={`rounded px-2 py-1 text-xs ${orient === v ? "bg-(--color-accent) text-white" : "border border-(--color-line)"}`}
        >
          {label}
        </button>
      ))}
      {showTheme && (
        <>
          <span className="ml-3 text-xs text-(--color-dim)">色</span>
          {[
            ["green", "グリーン"],
            ["navy", "ネイビー"],
            ["black", "ブラック"],
          ].map(([v, label]) => (
            <button
              key={v}
              onClick={() => set("theme", v)}
              className={`rounded px-2 py-1 text-xs ${theme === v ? "bg-(--color-accent) text-white" : "border border-(--color-line)"}`}
            >
              {label}
            </button>
          ))}
        </>
      )}
      <button
        onClick={() => window.print()}
        className="ml-auto rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white"
      >
        印刷する
      </button>
    </div>
  );
}
