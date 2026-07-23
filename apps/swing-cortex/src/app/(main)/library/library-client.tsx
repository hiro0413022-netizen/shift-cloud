"use client";

import { useMemo, useState } from "react";
import type { DiagnosisResult } from "@/lib/coaching";
import { Sheet } from "../diagnosis-client";

export default function LibraryClient({ tree }: { tree: DiagnosisResult[] }) {
  const [sel, setSel] = useState<DiagnosisResult | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("すべて");
  const [toastMsg, setToastMsg] = useState("");
  const toast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(""), 1900);
  };

  const cats = useMemo(() => ["すべて", ...new Set(tree.map((s) => s.category))], [tree]);

  const filtered = useMemo(() => {
    const query = q.trim();
    return tree.filter((s) => {
      if (cat !== "すべて" && s.category !== cat) return false;
      if (!query) return true;
      const hay = [s.symptomName, s.category, ...(s.tags ?? []), ...s.checkpoints.map((c) => c.title)].join(" ");
      return hay.includes(query);
    });
  }, [tree, q, cat]);

  // 表示用にカテゴリでまとめる（検索/絞り込み後）
  const groups = useMemo(() => {
    const order = [...new Set(tree.map((s) => s.category))];
    return order
      .map((c) => ({ cat: c, items: filtered.filter((s) => s.category === c) }))
      .filter((g) => g.items.length > 0);
  }, [filtered, tree]);

  const Card = ({ s }: { s: DiagnosisResult }) => (
    <button
      onClick={() => setSel(s)}
      className="flex min-h-[76px] w-full items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm active:scale-[0.99] active:bg-slate-50"
    >
      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold text-slate-800">{s.symptomName}</div>
        {s.tags?.length ? (
          <div className="mt-0.5 truncate text-[11px] text-slate-400">{s.tags.slice(0, 3).join("・")}</div>
        ) : (
          <div className="mt-0.5 text-[11px] text-slate-400">{s.checkpoints.length}件の確認項目</div>
        )}
      </div>
      <svg className="h-5 w-5 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );

  return (
    <div className="p-4 pb-8 md:p-6">
      <h1 className="mb-1 text-xl font-bold text-slate-900">症状別対処法</h1>
      <p className="mb-3 text-xs text-slate-400">この店のレッスンメソッド。症状を選ぶと原因・対処法・ドリル・お客様への説明が出ます。</p>

      {/* 検索バー（iPadでも押しやすい大きめ） */}
      <div className="sticky top-[57px] z-10 -mx-4 bg-(--color-bg)/95 px-4 py-2 backdrop-blur md:top-[61px] md:-mx-6 md:px-6">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.3-4.3M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="症状を検索（例: スライス、右に曲がる、猫背）"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-10 text-base outline-none placeholder:text-slate-400 focus:border-(--color-brand) focus:ring-2 focus:ring-teal-100"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
              ✕
            </button>
          )}
        </div>

        {/* カテゴリ絞り込みチップ（横スクロール） */}
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={
                "shrink-0 rounded-full px-4 py-2 text-sm font-semibold " +
                (cat === c ? "bg-teal-600 text-white" : "border border-slate-200 bg-white text-slate-600")
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 結果 */}
      <div className="mt-3">
        {q || cat !== "すべて" ? (
          // 検索/絞り込み中はフラットなグリッド
          <>
            <div className="mb-2 text-xs text-slate-400">{filtered.length}件</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <Card key={s.symptomId} s={s} />
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                該当なし。言い方を変えるか、カテゴリを「すべて」に戻してみてください。
              </div>
            )}
          </>
        ) : (
          // 通常はカテゴリ別セクション＋グリッド
          groups.map((g) => (
            <div key={g.cat} className="mb-5">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-sm font-bold text-teal-700">{g.cat}</span>
                <span className="text-[11px] text-slate-400">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((s) => (
                  <Card key={s.symptomId} s={s} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {tree.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          知識ベースが空です。設定 → Excel取込 から読み込んでください。
        </div>
      )}

      {sel && <Sheet symptom={sel} onClose={() => setSel(null)} toast={toast} />}
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
