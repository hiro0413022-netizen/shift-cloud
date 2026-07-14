"use client";

import { useState, useRef, useEffect } from "react";
import { ask } from "./actions";

type Turn = {
  question: string;
  answer: string;
  sql: string | null;
  rows: Record<string, unknown>[];
  rowCount: number;
  error: string | null;
  elapsedMs: number;
};

const EXAMPLES = [
  "今月の体験予約は何件？",
  "在籍会員は何名？",
  "今月の自分の勤務時間は？",
  "先月の売上は？",
  "来週のシフトは？",
];

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("ja-JP");
  if (typeof v === "boolean") return v ? "はい" : "いいえ";
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s) && s.length > 3) return Number(s).toLocaleString("ja-JP");
  return s;
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="mt-3 overflow-x-auto rounded border border-zinc-200">
      <table className="w-full text-xs">
        <thead className="bg-zinc-50 text-zinc-500">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((r, i) => (
            <tr key={i} className="border-t border-zinc-100">
              {cols.map((c) => (
                <td key={c} className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                  {fmtCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 30 && (
        <p className="px-2 py-1.5 text-xs text-zinc-500">ほか {rows.length - 30} 行</p>
      )}
    </div>
  );
}

export function ChatClient({ scopeLabel }: { scopeLabel: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setBusy(true);
    const res = await ask(text);
    setTurns((t) => [...t, { question: text, ...res }]);
    setBusy(false);
  }

  return (
    <div>
      {turns.length === 0 && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm text-zinc-500">
            数字はデータベースが計算します（AIが推測することはありません）。
            <br />
            参照範囲: {scopeLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => send(e)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs hover:bg-zinc-50"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {turns.map((t, i) => (
          <div key={i}>
            <div className="mb-2 flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-(--color-brand) px-3 py-2 text-sm text-white">
                {t.question}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.answer}</p>
              <ResultTable rows={t.rows} />
              {t.sql && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-zinc-400">
                    出典 — {t.rowCount} 行 / 実行したSQL
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-zinc-50 p-2 text-xs text-zinc-500">{t.sql}</pre>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-zinc-500">データを照会しています…</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
        className="sticky bottom-16 mt-5 flex gap-2 bg-zinc-50 py-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="例: 今月の体験予約は何件？"
          disabled={busy}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand)"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="rounded-lg bg-(--color-brand) px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          聞く
        </button>
      </form>
    </div>
  );
}
