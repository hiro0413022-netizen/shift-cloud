"use client";

import { useState, useTransition } from "react";
import { importCsv } from "./actions";
import type { ImportResult } from "@/lib/import/categorize";
import { inputCls, btnCls } from "@/components/ui";

export function Uploader({ sources }: { sources: { code: string; name: string }[] }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => setResult(await importCsv(fd)));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select name="source_code" className={inputCls} style={{ maxWidth: 220 }} defaultValue="">
          <option value="" disabled>取込元を選択</option>
          {sources.map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
        <input type="file" name="file" accept=".csv" className={inputCls} style={{ maxWidth: 280 }} />
        <button disabled={pending} className={btnCls}>{pending ? "取込中..." : "CSVを取込"}</button>
      </div>
      {result && (
        <div className="rounded-lg border border-[--color-line] bg-[--color-bg] p-3 text-sm">
          {result.errors.length > 0 && result.ok === 0 ? (
            <p className="text-red-400">取込失敗: {result.errors.join(" / ")}</p>
          ) : (
            <p className="text-[--color-ok]">
              取込 {result.ok} 件 / 重複スキップ {result.skipped} 件
              {result.errors.length > 0 && `（警告 ${result.errors.length} 件）`}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
