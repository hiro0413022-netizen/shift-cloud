"use client";

import { useState, useRef, useEffect } from "react";
import { ask } from "./actions";

export type Turn = {
  question: string;
  answer: string;
  sql: string | null;
  rows: Record<string, unknown>[];
  rowCount: number;
  error: string | null;
  elapsedMs: number;
};

const EXAMPLES = [
  "先月の店舗別売上を教えて",
  "在籍会員は何名？店舗別に",
  "今月退会した人と理由は？",
  "今月の残業時間が多いスタッフ上位5人",
  "期限が60日以内に切れる契約は？",
  "未分類のままの銀行取引は何件？",
];

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString("ja-JP");
  if (typeof v === "boolean") return v ? "はい" : "いいえ";
  const s = String(v);
  // 数値文字列（numericはstringで来る）も3桁区切りにする
  if (/^-?\d+(\.\d+)?$/.test(s) && s.length > 3) return Number(s).toLocaleString("ja-JP");
  return s;
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="mt-3 overflow-x-auto rounded border border-(--color-line)">
      <table className="w-full text-xs">
        <thead className="bg-(--color-panel) text-(--color-dim)">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((r, i) => (
            <tr key={i} className="border-t border-(--color-line)">
              {cols.map((c) => (
                <td key={c} className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                  {fmtCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <p className="px-2 py-1.5 text-xs text-(--color-dim)">ほか {rows.length - 50} 行（全 {rows.length} 行）</p>
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
        <div className="mb-6 rounded-lg border border-(--color-line) bg-(--color-panel) p-4">
          <p className="mb-3 text-sm text-(--color-dim)">
            実データに直接聞けます。数字はデータベースが計算し、使ったSQLと件数を必ず表示します（推測はしません）。
            <br />
            参照範囲: {scopeLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => send(e)}
                className="rounded-full border border-(--color-line) px-3 py-1 text-xs hover:bg-(--color-bg)"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {turns.map((t, i) => (
          <div key={i}>
            <div className="mb-2 flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-(--color-accent) px-3 py-2 text-sm text-(--color-bg)">
                {t.question}
              </p>
            </div>
            <div className="rounded-lg border border-(--color-line) bg-(--color-panel) p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.answer}</p>
              <ResultTable rows={t.rows} />
              {t.sql && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-(--color-dim)">
                    出典 — {t.rowCount} 行 / {t.elapsedMs}ms / 実行したSQLを見る
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-(--color-bg) p-2 text-xs text-(--color-dim)">
                    {t.sql}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p className="text-sm text-(--color-dim)">データを照会しています…</p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
        className="sticky bottom-0 mt-6 flex gap-2 bg-(--color-bg) py-3"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="例: 先月の店舗別売上は？"
          disabled={busy}
          className="flex-1 rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-bg) disabled:opacity-40"
        >
          聞く
        </button>
      </form>
    </div>
  );
}
