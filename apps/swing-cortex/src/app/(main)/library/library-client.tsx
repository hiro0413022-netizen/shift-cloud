"use client";

import { useState } from "react";
import type { DiagnosisResult } from "@/lib/coaching";
import { Sheet } from "../diagnosis-client";

export default function LibraryClient({ tree }: { tree: DiagnosisResult[] }) {
  const [sel, setSel] = useState<DiagnosisResult | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const toast = (m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(""), 1900);
  };
  const cats = [...new Set(tree.map((s) => s.category))];

  return (
    <div className="p-5 pb-8">
      <h1 className="mb-1 text-xl font-bold text-slate-900">症状別対処法</h1>
      <p className="mb-4 text-xs text-slate-400">この店のレッスンメソッド。症状を選ぶと原因・対処法・ドリル・生徒への説明が出ます。</p>
      {cats.map((cat) => (
        <div key={cat} className="mb-5">
          <div className="mb-2 text-xs font-semibold text-teal-700">{cat}</div>
          <div className="space-y-2">
            {tree
              .filter((s) => s.category === cat)
              .map((s) => (
                <button
                  key={s.symptomId}
                  onClick={() => setSel(s)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <div className="text-left">
                    <div className="font-semibold text-slate-800">{s.symptomName}</div>
                    <div className="text-xs text-slate-400">{s.checkpoints.length}件の確認項目</div>
                  </div>
                  <svg className="h-5 w-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              ))}
          </div>
        </div>
      ))}
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
