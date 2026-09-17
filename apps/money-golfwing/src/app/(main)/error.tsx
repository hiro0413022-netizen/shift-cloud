"use client";

import { useEffect } from "react";

/**
 * 画面の途中で落ちたときの受け皿。
 * これが無いと英語の「Application error: a client-side exception has occurred」だけの白い画面になり、
 * 何が起きたのか・どうすればいいのかが店頭で分からなかった（2026-09-17）。
 */
export default function MainError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[money-os] 画面エラー", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-6">
      <h1 className="text-lg font-bold">画面を表示できませんでした</h1>
      <p className="text-sm leading-relaxed">
        ログインが切れたか、通信が一時的に切れた可能性があります。
        「もう一度表示」を押しても直らないときは、「ログインし直す」を押してください。
      </p>
      <p className="text-sm leading-relaxed text-(--color-dim)">
        保存ボタンを押した直後だった場合は、明細に入っているかを確かめてから入力し直してください（二重に入らないように）。
        売上の入力画面では、保存できなかった入力をこの端末に残してあり、開き直すと「入力を戻す」が出ます。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-(--color-gold) px-4 py-2 text-sm font-medium text-white"
        >
          もう一度表示
        </button>
        <a href="/login" className="rounded-lg border border-(--color-line) px-4 py-2 text-sm">
          ログインし直す
        </a>
      </div>
      {error?.digest && <p className="text-xs text-(--color-dim)">エラー番号: {error.digest}</p>}
      {error?.message && <p className="break-all text-xs text-(--color-dim)">詳細: {error.message}</p>}
    </div>
  );
}
