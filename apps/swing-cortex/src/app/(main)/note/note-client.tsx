"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadVoiceNote, saveVoiceNote, deleteNoteAudio, deleteNoteTranscript, removeVoiceNote,
  type VoiceNoteItem,
} from "../note-actions";

/** AIが裏で走っている間の状態。これらは数秒おきに読み直す */
const WORKING = new Set(["draft", "uploaded"]);

const mmss = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`);

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "録音中／未送信", cls: "bg-slate-100 text-slate-500" },
  uploaded: { label: "AIが下書きを作っています", cls: "bg-amber-100 text-amber-700" },
  summarized: { label: "下書きができました", cls: "bg-teal-100 text-teal-700" },
  saved: { label: "保存済み", cls: "bg-emerald-600 text-white" },
  failed: { label: "できませんでした", cls: "bg-rose-100 text-rose-700" },
};

export default function NoteClient({ initial }: { initial: VoiceNoteItem[] }) {
  const [notes, setNotes] = useState<VoiceNoteItem[]>(initial);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [coach, setCoach] = useState<Record<string, string>>({});
  const [openTranscript, setOpenTranscript] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async (id: string) => {
    const r = await loadVoiceNote(id);
    if (r.note) setNotes((prev) => prev.map((n) => (n.id === id ? (r.note as VoiceNoteItem) : n)));
  }, []);

  // 要約は裏で走っているので、終わっていない行だけ見に行く
  useEffect(() => {
    const working = notes.filter((n) => WORKING.has(n.status)).map((n) => n.id);
    if (!working.length) return;
    const t = setInterval(() => { for (const id of working) void refresh(id); }, 6000);
    return () => clearInterval(t);
  }, [notes, refresh]);

  const save = async (n: VoiceNoteItem) => {
    const body = comment[n.id] ?? n.comment;
    const note = coach[n.id] ?? n.coachNote;
    const r = await saveVoiceNote(n.id, body, note);
    if (r.error) { setMsg(r.error); return; }
    setMsg("保存しました");
    await refresh(n.id);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("コピーしました。PGA NOTE に貼ってください");
    } catch {
      setMsg("コピーできませんでした。長押しで選択してコピーしてください");
    }
  };

  if (!notes.length) {
    return <p className="text-sm text-slate-400">まだ記録はありません。</p>;
  }

  return (
    <div className="space-y-3">
      {msg && <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{msg}</div>}

      {notes.map((n) => {
        const st = STATUS[n.status] ?? STATUS.draft;
        const body = comment[n.id] ?? n.comment;
        const cn = coach[n.id] ?? n.coachNote;
        return (
          <div key={n.id} className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{n.lessonDate}</span>
              {n.seconds != null && <span className="text-[11px] text-slate-400">{mmss(n.seconds)}</span>}
              <span className={"ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold " + st.cls}>{st.label}</span>
            </div>

            {n.error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{n.error}</div>}

            {n.status === "uploaded" && (
              <p className="text-xs text-slate-500">音声を読んでいます。数分かかることがあります。</p>
            )}

            {(n.status === "summarized" || n.status === "saved") && (
              <>
                <label className="mb-1 block text-[11px] font-bold text-slate-500">PGA NOTE に貼るコメント</label>
                <textarea
                  value={body}
                  onChange={(e) => setComment((p) => ({ ...p, [n.id]: e.target.value }))}
                  rows={6}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm leading-relaxed"
                />
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => copy(body)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
                  >
                    コピー
                  </button>
                  <button
                    onClick={() => save(n)}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    確認して保存
                  </button>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-slate-500">先生の手元の記録</summary>
                  <textarea
                    value={cn}
                    onChange={(e) => setCoach((p) => ({ ...p, [n.id]: e.target.value }))}
                    rows={4}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm leading-relaxed"
                  />
                </details>

                {n.summary && (n.summary.today.length > 0 || n.summary.homework.length > 0) && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                    {n.summary.today.length > 0 && <div>今日直したこと: {n.summary.today.join(" / ")}</div>}
                    {n.summary.homework.length > 0 && <div>宿題: {n.summary.homework.join(" / ")}</div>}
                    {n.summary.next.length > 0 && <div>次回みるところ: {n.summary.next.join(" / ")}</div>}
                  </div>
                )}
              </>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span>{n.audioDeleted ? "音声は削除済み" : n.hasAudio ? "音声が残っています" : "音声なし"}</span>
              {n.hasAudio && (
                <button onClick={async () => { await deleteNoteAudio(n.id); await refresh(n.id); }} className="underline">
                  いま消す
                </button>
              )}
              {n.transcript && (
                <>
                  <button onClick={() => setOpenTranscript(openTranscript === n.id ? null : n.id)} className="underline">
                    文字起こし
                  </button>
                  <button
                    onClick={async () => { await deleteNoteTranscript(n.id); await refresh(n.id); }}
                    className="underline"
                  >
                    文字起こしを消す
                  </button>
                </>
              )}
              <button
                onClick={async () => {
                  await removeVoiceNote(n.id);
                  setNotes((prev) => prev.filter((x) => x.id !== n.id));
                }}
                className="ml-auto underline"
              >
                削除
              </button>
            </div>

            {openTranscript === n.id && n.transcript && (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                {n.transcript}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
