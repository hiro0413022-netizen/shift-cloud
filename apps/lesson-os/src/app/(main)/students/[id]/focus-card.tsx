"use client";

import { useState, useTransition } from "react";
import {
  FOCUS_EMPTY_MESSAGE,
  FOCUS_MAX,
  focusLines,
  focusUpdatedLabel,
} from "@yozan/core/lesson-focus";
import { saveFocus } from "./actions";

/**
 * 「今の課題」（#332・2026-10-02 ユーザー依頼）
 *
 * カルテのいちばん上に置く。過去のレッスン記録をさかのぼらずに
 * 「いま何を意識して練習するか」をコーチと会員の双方が一目で見られるようにするための枠。
 *
 * ★ 既定は読むだけの表示。【編集】を押したときだけ入力欄にする。
 *   毎回テキストエリアが開いていると、カルテを開くたびに触ってしまい
 *   「いつ誰が変えたか」が分からなくなる（最終更新日を出す意味がなくなる）。
 * ★ 保存した内容はそのまま会員ページにも出る＝お客様に見せる文章として書いてもらう。
 */
export default function FocusCard({
  studentId,
  focus,
  updatedAt,
  updatedBy,
}: {
  studentId: string;
  focus: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [value, setValue] = useState(focus ?? "");
  const [saved, setSaved] = useState(focus ?? "");
  const [at, setAt] = useState(updatedAt ?? null);
  const [by, setBy] = useState(updatedBy ?? null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  const lines = focusLines(saved);
  const day = focusUpdatedLabel(at);

  const save = () =>
    startTransition(async () => {
      setMsg("");
      const r = await saveFocus(studentId, value);
      if (r.error) {
        setMsg(r.error);
        return;
      }
      setSaved(r.focus ?? "");
      setValue(r.focus ?? "");
      setAt(r.updatedAt ?? null);
      setBy(r.updatedBy ?? null);
      setEditing(false);
      setMsg("保存しました（会員ページにも出ます）");
    });

  return (
    <div className="rounded-xl border border-(--color-gold) bg-(--color-panel) p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-(--color-gold)">今の課題</h2>
        {day && (
          <span className="text-[11px] text-(--color-dim)">
            {day} 更新{by ? `・${by}` : ""}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {editing ? (
            <>
              <button onClick={save} disabled={pending} className="btn-gold !px-3 !py-1 text-xs">
                {pending ? "保存中…" : "保存"}
              </button>
              <button
                onClick={() => {
                  setValue(saved);
                  setEditing(false);
                  setMsg("");
                }}
                disabled={pending}
                className="btn-ghost !px-3 !py-1 text-xs"
              >
                やめる
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-ghost !px-3 !py-1 text-xs">
              ✎ 編集
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={5}
            maxLength={FOCUS_MAX}
            placeholder={"① バックスイングで伸び上がらず、前傾を保つ\n② 腰から腰のハーフスイングで、腕と体の動きを合わせる\n③ フィニッシュで左足にしっかり体重を乗せる"}
            className="input-dark mt-2 w-full resize-y whitespace-pre-wrap"
          />
          <p className="mt-1 text-[11px] text-(--color-dim)">
            1行に1つずつ、改行して書いてください。ここに書いた文章はそのまま会員ページに出ます（会員は見るだけ）。
          </p>
        </>
      ) : lines.length > 0 ? (
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

      {msg && <p className="mt-2 text-xs text-(--color-gold)">{msg}</p>}
    </div>
  );
}
