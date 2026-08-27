"use client";

import { useState } from "react";
import {
  analyzeStyle,
  discoverThemes,
  generateThemeSymptom,
  removeSeedMaster,
  type MethodStatus,
} from "./method-actions";

type Step = { label: string; state: "run" | "ok" | "ng"; note?: string };

/**
 * 店オリジナル・メソッド生成（このシステムの核心）。
 * 取込済みコメントから、この店の言葉遣いのまま
 * 文体プロファイル→指導テーマ→症状ツリーを順に生成する。
 */
export default function MethodClient({ status }: { status: MethodStatus }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [replaceSeed, setReplaceSeed] = useState(true);
  const [done, setDone] = useState<string | null>(null);

  const disabled = running || !status.aiReady || status.comments === 0;

  async function run() {
    setRunning(true);
    setDone(null);
    const log: Step[] = [];
    const push = (label: string) => {
      log.push({ label, state: "run" });
      setSteps([...log]);
      return log.length - 1;
    };
    const upd = (i: number, s: Partial<Step>) => {
      log[i] = { ...log[i], ...s };
      setSteps([...log]);
    };

    let i = push("この店の文体を分析");
    const style = await analyzeStyle();
    upd(i, { state: style.ok ? "ok" : "ng", note: style.message });

    i = push("この店の指導テーマを発見");
    const disc = await discoverThemes();
    upd(i, { state: disc.ok ? "ok" : "ng", note: disc.message });
    if (!disc.ok || !disc.themes) {
      setRunning(false);
      return;
    }

    let okCount = 0;
    for (let t = 0; t < disc.themes.length; t++) {
      const theme = disc.themes[t];
      i = push(`メソッド生成: ${theme.name}`);
      const r = await generateThemeSymptom(theme, (t + 1) * 10);
      if (r.ok) okCount++;
      upd(i, { state: r.ok ? "ok" : "ng", note: r.message });
    }

    if (replaceSeed && okCount >= 5) {
      i = push("汎用テンプレを置き換え");
      const rm = await removeSeedMaster();
      upd(i, { state: rm.ok ? "ok" : "ng", note: rm.message });
    }

    setDone(`完了: ${okCount}テーマの店オリジナル・メソッドを生成しました`);
    setRunning(false);
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-sm font-bold text-white">脳</div>
        <div>
          <div className="text-sm font-semibold text-slate-800">この店のレッスンメソッドを生成</div>
          <div className="text-[11px] text-slate-500">
            取込済みコメント{status.comments.toLocaleString()}件から、この店の言葉遣い・ドリル名のまま診断メソッドを作ります
          </div>
        </div>
      </div>

      <div className="mb-2 flex gap-2 text-[11px] text-slate-500">
        <span className="rounded-full bg-white px-2 py-0.5">店メソッド {status.aiSymptoms}件</span>
        <span className="rounded-full bg-white px-2 py-0.5">汎用テンプレ {status.seedSymptoms}件</span>
        <span className="rounded-full bg-white px-2 py-0.5">文体 {status.hasStyle ? "学習済み" : "未学習"}</span>
      </div>

      {!status.aiReady && (
        <p className="mb-2 text-xs text-red-500">AIキーが未設定のため実行できません（Vercelの環境変数を確認）</p>
      )}
      {status.comments === 0 && <p className="mb-2 text-xs text-red-500">先に上のExcel取込でコメントを入れてください</p>}

      <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={replaceSeed}
          onChange={(e) => setReplaceSeed(e.target.checked)}
          className="h-4 w-4 accent-amber-500"
        />
        生成後、汎用テンプレ（seed）をこの店のメソッドに置き換える
      </label>

      <button
        onClick={run}
        disabled={disabled}
        className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        {running ? "生成中...（数分かかります）" : status.aiSymptoms > 0 ? "再生成する" : "生成を開始"}
      </button>

      {steps.length > 0 && (
        <ul className="mt-3 space-y-1">
          {steps.map((s, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs">
              <span>{s.state === "run" ? "⏳" : s.state === "ok" ? "✅" : "⚠️"}</span>
              <span className="text-slate-700">
                {s.label}
                {s.note ? <span className="text-slate-400">　{s.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {done && <p className="mt-2 text-xs font-semibold text-emerald-600">{done}</p>}
    </div>
  );
}
