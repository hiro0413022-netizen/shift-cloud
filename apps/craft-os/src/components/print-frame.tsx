"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * 印刷ツールバー（画面にだけ出る）。
 * craft-os の帳票は紙の運用に合わせて用紙が決まっているため、サイズは選ばせない。
 * （御見積書・御注文書＝A4縦／工房の組立指示書・表紙＝A4横。いまファイルに綴じている紙と同じ）
 *
 * 2026-09-19: 編集画面の【印刷】（保存してからここへ来る）は ?auto=1 付きで来るので、開いたらそのまま印刷ダイアログを出す。
 */
export function PrintToolbar({ title, note, next }: { title: string; note?: string; next?: ReactNode }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // 印刷ダイアログを閉じたら「次に進む」を出す（2026-09-19 ユーザー要望「印刷してからそのまま前の画面か注文書に進みたい」）
    const onAfter = () => setDone(true);
    window.addEventListener("afterprint", onAfter);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (new URLSearchParams(window.location.search).get("auto") === "1") {
      // 画像（ロゴ）が読み込まれてから
      t = setTimeout(() => window.print(), 400);
    }
    return () => {
      window.removeEventListener("afterprint", onAfter);
      if (t) clearTimeout(t);
    };
  }, []);

  return (
    <>
      <div className="no-print sticky top-0 z-10 mb-6 flex flex-wrap items-center gap-3 border-b border-(--color-line) bg-(--color-panel) px-4 py-3">
        <span className="text-sm font-bold">{title}</span>
        {note && <span className="text-xs text-(--color-dim)">{note}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {next}
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white"
          >
            印刷する
          </button>
        </div>
      </div>

      {done && next && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDone(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold">{title}の印刷が終わりました</p>
            <p className="mt-1 text-sm text-(--color-dim)">次はどこへ進みますか？</p>
            <div className="mt-4 flex flex-col gap-2 [&_a]:w-full [&_a]:justify-center [&_button]:w-full [&_button]:justify-center [&_form]:w-full">
              {next}
            </div>
            <button onClick={() => setDone(false)} className="mt-3 w-full text-center text-xs text-(--color-dim) hover:underline">
              このまま（もう一度印刷する）
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 編集画面（紙の上）に置く【印刷】ボタン。フォームの中に置く submit ボタンで、
 * 押すと「いま直した内容を保存 → 印刷画面を開いて印刷ダイアログ」まで一度に行う（保存し忘れた紙を刷らない）。
 * サーバー側は各保存アクションの afterSave() が then=print:<doc> を見て /print/<doc>/<id>?auto=1 へ飛ばす。
 */
export function PrintButtons({ items }: { items: { doc: "quote" | "order" | "cover" | "spec"; label: string; primary?: boolean }[] }) {
  return (
    <div className="no-print flex flex-wrap items-center justify-end gap-2">
      {items.map((it) => (
        <button
          key={it.doc}
          name="then"
          value={`print:${it.doc}`}
          className={
            it.primary
              ? "inline-flex items-center gap-1.5 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-accent-2)"
              : "inline-flex items-center gap-1.5 rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm font-medium hover:bg-(--color-panel-2)"
          }
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <path d="M6 14h12v8H6z" />
          </svg>
          {it.label}
        </button>
      ))}
    </div>
  );
}
