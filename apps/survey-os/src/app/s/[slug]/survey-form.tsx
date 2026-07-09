"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { submitSurvey, type SubmitState } from "./actions";
import type { AnswerValue, Question, QOption } from "@/lib/survey";

const field =
  "w-full rounded-xl border border-[--color-line] bg-white px-4 py-3 text-base text-[--color-txt] placeholder:text-[--color-dim]/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";
const cardCls = "rounded-2xl border border-[--color-line] bg-[--color-panel] p-5 shadow-sm";

type Answers = Record<string, AnswerValue>;

/* ============================================================
   順位付けリスト（ドラッグ&ドロップ + ▲▼ボタン、タブレット対応）
   ============================================================ */
function RankingList({ items, onReorder }: { items: QOption[]; onReorder: (order: string[]) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = items.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onReorder(next.map((i) => i.value));
  }

  return (
    <ul className="space-y-2">
      {items.map((it, idx) => (
        <li
          key={it.value}
          draggable
          onDragStart={() => setDragIdx(idx)}
          onDragOver={(e) => {
            e.preventDefault();
            setOverIdx(idx);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIdx != null) move(dragIdx, idx);
            setDragIdx(null);
            setOverIdx(null);
          }}
          onDragEnd={() => {
            setDragIdx(null);
            setOverIdx(null);
          }}
          className={`rank-item flex items-center gap-3 rounded-xl border border-[--color-line] bg-white px-3 py-3 ${
            dragIdx === idx ? "dragging" : ""
          } ${overIdx === idx && dragIdx !== idx ? "over" : ""}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
            {idx + 1}
          </span>
          <span className="flex-1 text-sm font-medium">{it.label}</span>
          <span className="flex flex-col gap-0.5">
            <button
              type="button"
              aria-label="上へ"
              onClick={() => move(idx, idx - 1)}
              disabled={idx === 0}
              className="rounded border border-[--color-line] px-2 text-xs leading-5 text-[--color-dim] disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="下へ"
              onClick={() => move(idx, idx + 1)}
              disabled={idx === items.length - 1}
              className="rounded border border-[--color-line] px-2 text-xs leading-5 text-[--color-dim] disabled:opacity-30"
            >
              ▼
            </button>
          </span>
          <span className="cursor-grab select-none px-1 text-[--color-dim]" aria-hidden>⋮⋮</span>
        </li>
      ))}
    </ul>
  );
}

export function SurveyForm({
  slug,
  intro,
  thanks,
  estMinutes,
  anonymous,
  questions,
}: {
  slug: string;
  intro: string | null;
  thanks: string | null;
  estMinutes: number | null;
  anonymous: boolean;
  questions: Question[];
}) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitSurvey, {});
  const [clientKey, setClientKey] = useState("");
  const topRef = useRef<HTMLDivElement>(null);

  // 順位付けの母集団になる設問（is_ranking_source）
  const sourceCode = useMemo(
    () => questions.find((q) => q.type === "multi" && q.config.is_ranking_source)?.code ?? null,
    [questions]
  );

  // 初期回答: 固定poolのrankingはpool順で初期化
  const [answers, setAnswers] = useState<Answers>(() => {
    const init: Answers = {};
    for (const q of questions) {
      if (q.type === "ranking" && !q.config.source_code) {
        const pool = q.config.pool ?? q.options;
        init[q.code] = { order: pool.map((o) => o.value) };
      }
    }
    return init;
  });

  useEffect(() => {
    const KEY = "svy_ck";
    let v = "";
    try {
      v = localStorage.getItem(KEY) ?? "";
      if (!v) {
        v = crypto.randomUUID();
        localStorage.setItem(KEY, v);
      }
    } catch {
      v = Math.random().toString(36).slice(2);
    }
    setClientKey(v);
  }, []);

  useEffect(() => {
    if (state.error && topRef.current) topRef.current.scrollIntoView({ behavior: "smooth" });
  }, [state.error]);

  function set(code: string, v: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [code]: v }));
  }

  // コーチ選択の変更 → 対象rankingのorderを選択集合に同期
  function toggleSourceValue(code: string, value: string) {
    setAnswers((prev) => {
      const cur = prev[code]?.values ?? [];
      const nextSel = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const next: Answers = { ...prev, [code]: { values: nextSel } };
      // 対象rankingを同期
      for (const q of questions) {
        if (q.type === "ranking" && q.config.source_code === code) {
          const pool = q.config.pool ?? q.options;
          const prevOrder = prev[q.code]?.order ?? [];
          const kept = prevOrder.filter((v) => nextSel.includes(v));
          const added = pool.map((o) => o.value).filter((v) => nextSel.includes(v) && !kept.includes(v));
          next[q.code] = { order: [...kept, ...added] };
        }
      }
      return next;
    });
  }

  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">✓</div>
        <p className="mt-3 text-lg font-semibold">送信が完了しました</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[--color-dim]">
          {thanks ?? "ご協力ありがとうございました。"}
        </p>
      </div>
    );
  }

  // セクションごとにグルーピング
  const sections: { name: string; qs: Question[] }[] = [];
  for (const q of questions) {
    const name = q.section ?? "";
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.qs.push(q);
    else sections.push({ name, qs: [q] });
  }

  const selectedForSource = (code: string) => answers[code]?.values ?? [];

  return (
    <form action={action} className="space-y-5 pb-16">
      <div ref={topRef} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="client_key" value={clientKey} />
      <input type="hidden" name="payload" value={JSON.stringify(answers)} />

      {/* イントロ */}
      <div className={`${cardCls} space-y-2`}>
        {intro && <p className="whitespace-pre-wrap text-sm leading-relaxed text-[--color-txt]">{intro}</p>}
        <p className="text-xs text-[--color-dim]">
          {anonymous ? "匿名アンケート" : "記名アンケート"}
          {estMinutes ? ` ・ 所要時間 約${estMinutes}分` : ""}
        </p>
      </div>

      {sections.map((sec) => (
        <div key={sec.name} className="space-y-4">
          {sec.name && (
            <h2 className="px-1 pt-2 text-sm font-bold tracking-wide text-accent">{sec.name}</h2>
          )}
          {sec.qs.map((q) => {
            // 順位付け設問: 対象コーチ未選択なら案内
            let rankingItems: QOption[] = [];
            let rankingBlocked = false;
            if (q.type === "ranking") {
              const pool = q.config.pool ?? q.options;
              if (q.config.source_code) {
                const sel = selectedForSource(q.config.source_code);
                if (sel.length === 0) rankingBlocked = true;
                const order = answers[q.code]?.order ?? [];
                rankingItems = order
                  .map((v) => pool.find((o) => o.value === v))
                  .filter((o): o is QOption => !!o);
              } else {
                const order = answers[q.code]?.order ?? pool.map((o) => o.value);
                rankingItems = order
                  .map((v) => pool.find((o) => o.value === v))
                  .filter((o): o is QOption => !!o);
              }
            }

            return (
              <div key={q.code} className={`${cardCls} space-y-3`}>
                <div>
                  <p className="text-sm font-semibold text-[--color-txt]">
                    <span className="mr-1 text-xs text-[--color-dim]">{q.code}</span>
                    {q.title}
                    {q.required && <span className="ml-1 text-rose-500">*</span>}
                  </p>
                  {q.help_text && <p className="mt-1 text-xs text-[--color-dim]">{q.help_text}</p>}
                </div>

                {/* 単一選択 */}
                {q.type === "single" && (
                  <div className="grid grid-cols-1 gap-2">
                    {q.options.map((o) => {
                      const checked = answers[q.code]?.value === o.value;
                      return (
                        <label
                          key={o.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors ${
                            checked ? "border-accent bg-accent/10 text-accent" : "border-[--color-line] bg-white text-[--color-txt]"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`r_${q.code}`}
                            className="sr-only"
                            checked={checked}
                            onChange={() => set(q.code, { value: o.value })}
                          />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* スケール */}
                {q.type === "scale" && (
                  <div className="grid grid-cols-1 gap-2">
                    {q.options.map((o) => {
                      const checked = answers[q.code]?.value === o.value;
                      return (
                        <label
                          key={o.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors ${
                            checked ? "border-accent bg-accent/10 text-accent" : "border-[--color-line] bg-white text-[--color-txt]"
                          }`}
                        >
                          <input type="radio" name={`s_${q.code}`} className="sr-only" checked={checked} onChange={() => set(q.code, { value: o.value })} />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* 複数選択 */}
                {q.type === "multi" && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((o) => {
                        const isSource = q.config.is_ranking_source;
                        const cur = answers[q.code]?.values ?? [];
                        const checked = cur.includes(o.value);
                        return (
                          <label
                            key={o.value}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                              checked ? "border-accent bg-accent/5" : "border-[--color-line] bg-white"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-[--color-accent]"
                              checked={checked}
                              onChange={() => {
                                if (isSource) toggleSourceValue(q.code, o.value);
                                else {
                                  const nextSel = checked ? cur.filter((v) => v !== o.value) : [...cur, o.value];
                                  set(q.code, { ...answers[q.code], values: nextSel });
                                }
                              }}
                            />
                            {o.label}
                          </label>
                        );
                      })}
                    </div>
                    {q.config.allow_other && (answers[q.code]?.values ?? []).includes("other") && (
                      <input
                        className={field}
                        placeholder="その他（自由記述）"
                        value={answers[q.code]?.other ?? ""}
                        onChange={(e) => set(q.code, { ...answers[q.code], values: answers[q.code]?.values ?? [], other: e.target.value })}
                      />
                    )}
                  </div>
                )}

                {/* 短文 */}
                {q.type === "text" && (
                  <input
                    className={field}
                    value={answers[q.code]?.text ?? ""}
                    onChange={(e) => set(q.code, { text: e.target.value })}
                  />
                )}

                {/* 自由記述 */}
                {q.type === "textarea" && (
                  <textarea
                    rows={4}
                    className={field}
                    placeholder="自由記述"
                    value={answers[q.code]?.text ?? ""}
                    onChange={(e) => set(q.code, { text: e.target.value })}
                  />
                )}

                {/* 順位付け */}
                {q.type === "ranking" && (
                  rankingBlocked ? (
                    <p className="rounded-lg border border-dashed border-[--color-line] bg-[--color-panel-2] px-3 py-3 text-xs text-[--color-dim]">
                      受講経験のあるコーチを上の設問で選択すると、ここで順位付けできます。（受講していないコーチは評価不要です）
                    </p>
                  ) : rankingItems.length <= 1 ? (
                    <div className="space-y-2">
                      {rankingItems.map((it) => (
                        <div key={it.value} className="flex items-center gap-3 rounded-xl border border-[--color-line] bg-white px-3 py-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">1</span>
                          <span className="text-sm font-medium">{it.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <RankingList items={rankingItems} onReorder={(order) => set(q.code, { order })} />
                  )
                )}
              </div>
            );
          })}
        </div>
      ))}

      {state.error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-600">{state.error}</p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {pending ? "送信中..." : "この内容で送信する"}
      </button>
      <p className="text-center text-xs text-[--color-dim]">送信後の再送信はご遠慮ください。</p>
    </form>
  );
}
