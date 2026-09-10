"use client";

import { useState, useTransition } from "react";
import type { SurveyQuestion } from "@/lib/compe";
import { saveSurvey } from "../actions";
import { btnCls, btnGhostCls, inputCls, labelCls } from "@/components/ui";

export function SurveyEditor({
  compId,
  title,
  desc,
  questions,
}: {
  compId: string;
  title: string;
  desc: string;
  questions: SurveyQuestion[];
}) {
  const [t, setT] = useState(title);
  const [d, setD] = useState(desc);
  const [qs, setQs] = useState<SurveyQuestion[]>(questions);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<SurveyQuestion>) =>
    setQs((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <>
      <div className="mb-5 grid gap-4">
        <label className="block">
          <span className={labelCls}>アンケートのタイトル</span>
          <input value={t} onChange={(e) => setT(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>説明文</span>
          <textarea value={d} onChange={(e) => setD(e.target.value)} rows={3} className={inputCls} />
        </label>
      </div>

      <div className="space-y-3">
        {qs.map((q, i) => (
          <div key={q.id} className="rounded-lg bg-(--color-panel-2) p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--color-accent) text-xs font-bold text-white">
                {i + 1}
              </span>
              <div className="flex-1 space-y-2">
                <input value={q.text} onChange={(e) => update(i, { text: e.target.value })} className={inputCls} />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={q.type}
                    onChange={(e) => update(i, { type: e.target.value as SurveyQuestion["type"] })}
                    className={`${inputCls} w-36`}
                  >
                    <option value="radio">1つ選ぶ</option>
                    <option value="checkbox">いくつでも選ぶ</option>
                    <option value="text">自由記述</option>
                  </select>
                  {q.type !== "text" && (
                    <input
                      value={q.options.join(" / ")}
                      onChange={(e) => update(i, { options: e.target.value.split("/").map((s) => s.trim()).filter(Boolean) })}
                      placeholder="選択肢を / で区切って入力"
                      className={`${inputCls} flex-1`}
                    />
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setQs((list) => list.filter((_, j) => j !== i))} className="px-2 text-sm text-red-600">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setQs((list) => [
              ...list,
              { id: `q_${Math.random().toString(36).slice(2, 9)}`, type: "text", text: "（質問を入力してください）", options: [] },
            ])
          }
          className={btnGhostCls}
        >
          質問を追加
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void saveSurvey(compId, t, d, qs);
            })
          }
          className={`${btnCls} ml-auto`}
        >
          {pending ? "保存中..." : "保存する"}
        </button>
      </div>
    </>
  );
}
