"use client";

import { useState } from "react";
import { adoptCandidate, rejectCandidate, type CandidateBoard, type CandidateItem } from "./candidate-actions";

/**
 * ナレッジの提案（2026-09-03）
 *
 * ここに出るのは「別々の日に PROMOTE_HITS 回以上、同じ趣旨で出た」候補だけ。
 * AIの自己採点ではなく回数で門を作っている（VOICE_NOTE.md §4）。
 * **採用ボタンを押すまで、ナレッジ本体には1文字も入らない。**
 */
export default function CandidatesClient({ board }: { board: CandidateBoard }) {
  const [items, setItems] = useState<CandidateItem[]>(board.queued);
  const [edit, setEdit] = useState<Record<string, Partial<CandidateItem["proposed"]> & { category?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const field = (c: CandidateItem, k: "title" | "cause" | "fix" | "drill" | "client") =>
    (edit[c.id]?.[k] as string | undefined) ?? (k === "title" ? c.proposed.title : (c.proposed[k] ?? "")) ?? "";

  const set = (id: string, k: string, v: string) =>
    setEdit((p) => ({ ...p, [id]: { ...(p[id] ?? {}), [k]: v } }));

  const adopt = async (c: CandidateItem) => {
    setBusy(c.id);
    const r = await adoptCandidate({
      id: c.id,
      title: field(c, "title"),
      cause: field(c, "cause"),
      fix: field(c, "fix"),
      drill: field(c, "drill"),
      client: field(c, "client"),
      name: (edit[c.id]?.name as string | undefined) ?? c.proposed.name ?? c.proposed.title,
      category: (edit[c.id]?.category as string | undefined) ?? board.categories[0] ?? "",
    });
    setBusy(null);
    if (r.error) { setMsg(r.error); return; }
    setItems((p) => p.filter((x) => x.id !== c.id));
    setMsg("ナレッジに追加しました");
  };

  const skip = async (c: CandidateItem) => {
    setBusy(c.id);
    const r = await rejectCandidate(c.id);
    setBusy(null);
    if (r.error) { setMsg(r.error); return; }
    setItems((p) => p.filter((x) => x.id !== c.id));
    setMsg("見送りました（記録には残るので、また出てくれば回数が増えます）");
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">ナレッジの提案</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            レッスンの録音から拾った指導の型のうち、<b>別々の日に{board.promoteHits}回以上</b>出てきたものだけを出しています。
            採用を押すまでナレッジには入りません。
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-slate-900">{board.learnedCount}</div>
          <div className="text-[10px] text-slate-400">育った知識</div>
        </div>
      </div>

      <div className="mt-2 flex gap-3 text-[11px] text-slate-400">
        <span>溜まっている候補 {board.collecting}</span>
        <span>見送り {board.rejected}</span>
      </div>

      {msg && <div className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{msg}</div>}

      {!items.length ? (
        <p className="mt-3 text-xs text-slate-400">
          いま出せる提案はありません。録音を続けると、繰り返し出てきた指導がここに並びます。
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + (c.kind === "append" ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700")}>
                  {c.kind === "append" ? (c.checkpointTitle ? "既存の確認項目に足す" : "既存の症状に確認項目を足す") : "新しい症状"}
                </span>
                {c.symptomName && <span className="text-[11px] text-slate-500">{c.symptomName}</span>}
                {c.checkpointTitle && <span className="text-[11px] text-slate-400">／{c.checkpointTitle}</span>}
                <span className="ml-auto text-[11px] font-bold text-slate-600">{c.hits}日ぶん</span>
              </div>

              <div className="mb-2 text-[10px] text-slate-400">
                {c.firstSeenOn} 〜 {c.lastSeenOn}
                {c.quote && <span className="ml-2 text-slate-500">「{c.quote}」</span>}
              </div>

              {c.kind === "new_symptom" && (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <input
                    value={(edit[c.id]?.name as string | undefined) ?? c.proposed.name ?? c.proposed.title}
                    onChange={(e) => set(c.id, "name", e.target.value)}
                    placeholder="症状名"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <input
                    list={`cat-${c.id}`}
                    value={(edit[c.id]?.category as string | undefined) ?? board.categories[0] ?? ""}
                    onChange={(e) => set(c.id, "category", e.target.value)}
                    placeholder="分類"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  />
                  <datalist id={`cat-${c.id}`}>
                    {board.categories.map((x) => <option key={x} value={x} />)}
                  </datalist>
                </div>
              )}

              <div className="space-y-1.5">
                <input
                  value={field(c, "title")}
                  onChange={(e) => set(c.id, "title", e.target.value)}
                  placeholder="確認項目"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold"
                />
                <textarea
                  value={field(c, "cause")}
                  onChange={(e) => set(c.id, "cause", e.target.value)}
                  rows={2}
                  placeholder="原因"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <textarea
                  value={field(c, "fix")}
                  onChange={(e) => set(c.id, "fix", e.target.value)}
                  rows={2}
                  placeholder="対処"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <input
                  value={field(c, "drill")}
                  onChange={(e) => set(c.id, "drill", e.target.value)}
                  placeholder="ドリル"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <textarea
                  value={field(c, "client")}
                  onChange={(e) => set(c.id, "client", e.target.value)}
                  rows={2}
                  placeholder="お客様への説明"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  disabled={busy === c.id}
                  onClick={() => adopt(c)}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white disabled:bg-slate-300"
                >
                  採用する
                </button>
                <button
                  disabled={busy === c.id}
                  onClick={() => skip(c)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                >
                  見送る
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
