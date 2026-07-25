"use client";

import { useEffect, useState } from "react";

/**
 * 使い方マニュアル（NEXT_TASKS MN）
 * public/manual.md（正典: docs/modules/<os>/RUNBOOK.md のコピー）を表示。
 * ログイン不要（middleware publicPrefixes に /manual）。印刷＝ブラウザのPDF保存。
 */
export default function ManualPage() {
  const [md, setMd] = useState<string | null>(null);

  useEffect(() => {
    fetch("/manual.md")
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then(setMd)
      .catch(() => setMd("マニュアルを読み込めませんでした。通信を確認して再読み込みしてください。"));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 print:max-w-none print:px-0">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <a href="/login" className="text-sm underline underline-offset-2 opacity-70">← ログインへ戻る</a>
        <div className="flex gap-2">
          <a
            href="/manual.md"
            download="manual.md"
            className="rounded-lg border border-current/30 px-3 py-1.5 text-sm opacity-80"
          >
            ⬇ ダウンロード
          </a>
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-current/30 px-3 py-1.5 text-sm opacity-80"
          >
            🖨 印刷 / PDF保存
          </button>
        </div>
      </div>
      {md === null ? <p className="text-sm opacity-60">読み込み中…</p> : <Markdown text={md} />}
    </main>
  );
}

/** 依存なしの簡易Markdown表示（見出し/箇条書き/表/太字/罫線のみ） */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let table: string[][] | null = null;

  const bold = (s: string) => {
    const parts = s.split("**");
    return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p));
  };
  const flushTable = (key: number) => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push(
      <table key={`t${key}`} className="my-3 w-full border-collapse text-sm">
        <thead>
          <tr>{head.map((c, i) => <th key={i} className="border border-current/20 px-2 py-1.5 text-left">{bold(c)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className="border border-current/20 px-2 py-1.5 align-top">{bold(c)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    );
    table = null;
  };

  lines.forEach((line, i) => {
    const t = line.trimEnd();
    if (t.startsWith("|")) {
      const cells = t.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) return; // 区切り行
      (table ??= []).push(cells);
      return;
    }
    flushTable(i);
    if (t.startsWith("# ")) out.push(<h1 key={i} className="mb-2 mt-1 text-xl font-bold">{bold(t.slice(2))}</h1>);
    else if (t.startsWith("## ")) out.push(<h2 key={i} className="mb-2 mt-6 border-b border-current/20 pb-1 text-base font-semibold">{bold(t.slice(3))}</h2>);
    else if (t === "---") out.push(<hr key={i} className="my-4 border-current/20" />);
    else if (t === "") out.push(<div key={i} className="h-2" />);
    else out.push(<p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">{bold(t)}</p>);
  });
  flushTable(lines.length + 1);

  return <article>{out}</article>;
}
