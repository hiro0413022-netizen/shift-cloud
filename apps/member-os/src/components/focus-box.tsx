import { FOCUS_EMPTY_MESSAGE, focusLines, focusUpdatedLabel } from "@yozan/core/lesson-focus";

/**
 * 「今の課題」の読み取り専用表示（#332・2026-10-02 ユーザー依頼）
 *
 * ★ 入力・編集はレッスンノート（lesson-os）のカルテだけ。ここは見るだけ。
 *   会員ご本人の画面と、スタッフのFRANK会員カードの両方で同じ形で出すため部品にした。
 *   同じ文章が2通りの見た目で出ると「どっちが新しいのか」を疑わせる。
 * ★ 未入力でも枠は出す（ユーザー指定の文言を出す）。
 *   枠ごと消すと「課題が無い」のか「機能が無い」のか分からない。
 */
export default function FocusBox({
  focus,
  updatedAt,
  note,
}: {
  focus: string | null | undefined;
  updatedAt: string | null | undefined;
  /** 枠の下に出す小さな但し書き（スタッフ画面で「編集はレッスンノートから」と案内する用） */
  note?: string;
}) {
  const lines = focusLines(focus);
  const day = focusUpdatedLabel(updatedAt);
  return (
    <div className="rounded-xl border border-(--color-gold)/50 bg-(--color-panel) px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-(--color-gold)">今の課題</h2>
        {day && <span className="text-[11px] text-(--color-dim)">{day} 更新</span>}
      </div>
      {lines.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm leading-relaxed">
          {lines.map((l, i) => (
            <li key={i} className="break-words">
              {l}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-(--color-dim)">{FOCUS_EMPTY_MESSAGE}</p>
      )}
      {note && <p className="mt-2 text-[11px] text-(--color-dim)">{note}</p>}
    </div>
  );
}
