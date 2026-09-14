"use client";

import { useEffect, useRef, useState } from "react";
import { inputCls } from "@/components/ui";
import { findCustomers } from "./actions";
import type { Person } from "@/lib/people";

/**
 * お客様をお名前で選ぶ。
 *
 * 2026-09-13 ユーザー要望：
 *   「money-os で名前をいちいち入力せずに、craft-os のように名前検索をメインにしてほしい」
 *
 * ここでの決めごと
 *   ・打つのは1〜2文字。1文字打った時点から候補を出す（250ms待ってから1回だけ問い合わせ）
 *   ・受付台帳は受付1回ごとの記録なので、DB側でお名前ごとに束ねた「人」を受け取る
 *   ・最初から「よく来られる方」を出す。空欄で止まる画面にしない
 *   ・台帳に無い方は手入力もできる（一見さん・法人・スタッフ）
 *   ・電話は下4桁だけ出す。店頭の画面に他の方の番号を全部出さない
 */
export default function CustomerPicker({
  value,
  onPick,
  /** 会員／ビジターの自動セット。台帳に在籍会員として載っていれば「会員」 */
  onMemberKind,
  recent,
}: {
  value: string;
  onPick: (name: string) => void;
  onMemberKind?: (kind: string) => void;
  recent?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // 打った順と返ってきた順がずれても、最後に打った内容の結果だけを採用する
  const seq = useRef(0);

  // 開いている間だけ、打鍵が止まってから探す
  useEffect(() => {
    if (!open || manual) return;
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      findCustomers(q)
        .then((r) => { if (mine === seq.current) setRows(r); })
        .finally(() => { if (mine === seq.current) setLoading(false); });
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, open, manual]);

  // 外側を押したら閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  function pick(p: Person) {
    onPick(p.name);
    onMemberKind?.(p.isMember ? "会員" : "ビジター");
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={boxRef} className="relative">
      {value && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setManual(false); }}
          className={`${inputCls} flex items-center justify-between text-left`}
          aria-label="お客様を選び直す"
        >
          <span className="truncate">{value} 様</span>
          <span className="ml-2 shrink-0 text-xs text-(--color-dim)">変更</span>
        </button>
      ) : (
        <input
          value={open ? q : value}
          onChange={(e) => { setQ(e.target.value); if (manual) onPick(e.target.value); }}
          onFocus={() => setOpen(true)}
          placeholder={manual ? "お名前を入力" : "お客様を探す（名前・カナ・電話下4桁）"}
          className={inputCls}
          aria-label="お客様"
        />
      )}

      {open && !manual && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 min-w-72 rounded-lg border border-(--color-line) bg-(--color-panel) shadow-xl">
          {recent && recent.length > 0 && q === "" && (
            <div className="flex flex-wrap gap-1 border-b border-(--color-line) p-2">
              <span className="self-center text-xs text-(--color-dim)">直近:</span>
              {recent.slice(0, 6).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => { onPick(n); setOpen(false); setQ(""); }}
                  className="rounded-md border border-(--color-line) px-2 py-0.5 text-xs hover:border-(--color-gold)"
                >{n}</button>
              ))}
            </div>
          )}

          <ul className="max-h-72 overflow-y-auto">
            {rows.map((p) => (
              <li key={p.nameKey}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-(--color-bg)"
                >
                  <span className="font-medium">{p.name}</span>
                  {p.isMember && (
                    <span className="rounded bg-(--color-gold) px-1 text-[10px] font-bold text-black">会員</span>
                  )}
                  {p.nameKana && <span className="truncate text-xs text-(--color-dim)">{p.nameKana}</span>}
                  <span className="ml-auto shrink-0 text-xs text-(--color-dim)">
                    {p.phoneLast4 ? `…${p.phoneLast4}` : ""}
                    {p.visits > 1 ? `　受付${p.visits}回` : ""}
                  </span>
                </button>
              </li>
            ))}
            {!loading && rows.length === 0 && (
              <li className="px-3 py-3 text-xs text-(--color-dim)">
                見つかりませんでした。下の「台帳に無い方」から入力してください。
              </li>
            )}
            {loading && rows.length === 0 && (
              <li className="px-3 py-3 text-xs text-(--color-dim)">探しています…</li>
            )}
          </ul>

          <div className="flex items-center justify-between border-t border-(--color-line) px-3 py-2">
            <button
              type="button"
              onClick={() => { setManual(true); onPick(q); }}
              className="text-xs text-(--color-dim) underline"
            >台帳に無い方（手入力）</button>
            {value && (
              <button
                type="button"
                onClick={() => { onPick(""); setQ(""); setOpen(false); }}
                className="text-xs text-(--color-dim) underline"
              >お客様名なしにする</button>
            )}
          </div>
        </div>
      )}

      {manual && (
        <button
          type="button"
          onClick={() => { setManual(false); setOpen(true); }}
          className="mt-1 text-xs text-(--color-dim) underline"
        >台帳から探す</button>
      )}
    </div>
  );
}
