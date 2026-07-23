"use client";

import { useActionState, useState } from "react";
import { importExcel, type ImportResult } from "./actions";

export default function ImportClient() {
  const [state, action, pending] = useActionState<ImportResult | null, FormData>(importExcel, null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState("append");

  return (
    <form action={action} className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white text-sm font-bold">XL</div>
        <div>
          <div className="text-sm font-semibold text-slate-800">Excelからコメントを取込・解析</div>
          <div className="text-[11px] text-slate-500">WING NOTE書き出し等（.xlsx）。局面×症状を自動集計します</div>
        </div>
      </div>

      <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-white py-6 text-center">
        <span className="text-sm text-slate-600">{fileName || "ここをクリックしてファイルを選ぶ"}</span>
        <span className="mt-1 text-[11px] text-slate-400">.xlsx / .xls</span>
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
      </label>

      <input type="hidden" name="mode" value={mode} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("append")}
          className={
            "rounded-xl border p-2 text-left text-xs " +
            (mode === "append" ? "border-teal-500 bg-white" : "border-slate-200 bg-white/60")
          }
        >
          <div className="font-semibold text-slate-700">追加モード</div>
          <div className="text-slate-400">既存に足す</div>
        </button>
        <button
          type="button"
          onClick={() => setMode("replace")}
          className={
            "rounded-xl border p-2 text-left text-xs " +
            (mode === "replace" ? "border-teal-500 bg-white" : "border-slate-200 bg-white/60")
          }
        >
          <div className="font-semibold text-slate-700">全入れ替え</div>
          <div className="text-slate-400">消してから登録</div>
        </button>
      </div>

      <button
        disabled={pending || !fileName}
        className="mt-3 w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        {pending ? "解析中..." : "取り込む"}
      </button>

      {state && (
        <p className={"mt-2 text-xs " + (state.ok ? "text-emerald-600" : "text-red-500")}>{state.message}</p>
      )}
    </form>
  );
}
