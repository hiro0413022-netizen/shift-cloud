"use client";

import { useEffect, useState } from "react";

/**
 * 使い方マニュアル（NEXT_TASKS MN）
 * public/manual.md を表示。ログイン不要（middleware publicPrefixes に /manual）。
 */
export default function ManualPage() {
  const [md, setMd] = useState<string | null>(null);

  useEffect(() => {
    fetch("/manual.md")
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then(setMd)
      .catch(() => setMd("マニュアルを読み込めませんでした。通信を確認して再読み込みしてください。"));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <a href="/login" className="text-sm underline underline-offset-2 opacity-70">← ログインへ戻る</a>
        <a href="/manual.md" download="manual.md" className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm opacity-80">
          ⬇ ダウンロード
        </a>
      </div>
      <article className="whitespace-pre-wrap text-sm leading-relaxed text-(--color-txt)">
        {md ?? "読み込み中..."}
      </article>
    </main>
  );
}
