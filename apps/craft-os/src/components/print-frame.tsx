"use client";

/**
 * 印刷ツールバー（画面にだけ出る）。
 * craft-os の帳票は紙の運用に合わせて用紙が決まっているため、サイズは選ばせない。
 * （御見積書・御注文書＝A4縦／工房の組立指示書＝A4横。いまファイルに綴じている紙と同じ）
 */
export function PrintToolbar({ title, note }: { title: string; note?: string }) {
  return (
    <div className="no-print sticky top-0 z-10 mb-6 flex flex-wrap items-center gap-3 border-b border-(--color-line) bg-(--color-panel) px-4 py-3">
      <span className="text-sm font-bold">{title}</span>
      {note && <span className="text-xs text-(--color-dim)">{note}</span>}
      <button
        onClick={() => window.print()}
        className="ml-auto rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white"
      >
        印刷する
      </button>
    </div>
  );
}
