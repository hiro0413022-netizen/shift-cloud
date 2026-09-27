"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  confirmMeeting, createSegmentUploadUrl, deleteMeeting, endRecording, finishSegment, reopenMeeting,
  retrySegments, saveSpeakers, setTranscriptText,
} from "./actions";
import { Recorder } from "./recorder";
import { driveTranscription, requestSummary, type ViewMeeting, type ViewSegment } from "./types";
import type { Item, QuoteCheck, Todo } from "@/lib/modes";
import { btnCls, btnDangerCls, btnGhostCls, cardCls, inputCls } from "@/components/ui";

type Props = {
  meeting: ViewMeeting;
  segments: ViewSegment[];
  modes: { id: string; label: string }[];
  segmentSeconds: number;
  maxFileBytes: number;
};

export function MeetingView({ meeting: m, segments, modes, segmentSeconds, maxFileBytes }: Props) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const started = useRef(false);

  /* 文字起こし中・要約待ちの会議は、画面を開いたら自動で続きを進める（状態はDBにある） */
  const proceed = useCallback(async () => {
    if (m.status === "transcribing") {
      setNote("文字起こしを進めています…");
      const r = await driveTranscription(m.id, setNote);
      if (r.error) {
        setNote(r.error);
        router.refresh();
        return;
      }
      if (!r.finalized) {
        router.refresh();
        return;
      }
    }
    setNote("要約を作っています…（数十秒〜2分ほど）");
    const s = await requestSummary(m.id);
    setNote(s.error ?? null);
    router.refresh();
  }, [m.id, m.status, router]);

  useEffect(() => {
    if (started.current) return;
    if (m.status === "transcribing" || m.status === "transcribed") {
      started.current = true;
      void proceed();
    }
  }, [m.status, proceed]);

  /* 別の画面が要約中なら、様子を見に行く */
  useEffect(() => {
    if (m.status !== "summarizing") return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [m.status, router]);

  const failedSegs = segments.filter((s) => s.status === "failed");

  return (
    <div className="space-y-5">
      {m.error && m.status !== "summarizing" && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{m.error}</p>
      )}

      {(m.status === "draft" || m.status === "recording") && m.source === "record" && (
        <section className={cardCls}>
          {m.status === "recording" && segments.length > 0 ? (
            <ResumeRecording id={m.id} count={segments.length} />
          ) : (
            <Recorder
              meetingId={m.id}
              segmentSeconds={segmentSeconds}
              firstIdx={segments.length ? Math.max(...segments.map((s) => s.idx)) + 1 : 0}
              onFinished={(err) => {
                if (err) setNote(err);
                router.refresh();
              }}
            />
          )}
          <p className="mt-4 text-xs text-(--color-dim)">処理する場所: {m.levelWhere}</p>
        </section>
      )}

      {m.status === "draft" && m.source === "file" && <FileUpload id={m.id} maxBytes={maxFileBytes} />}
      {m.status === "draft" && m.source === "text" && <TextPaste id={m.id} />}

      {["transcribing", "transcribed", "summarizing"].includes(m.status) && (
        <section className={cardCls}>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-(--color-accent)" />
            <p className="font-medium">
              {m.status === "summarizing" ? "要約を作っています…" : m.status === "transcribed" ? "要約の準備をしています…" : "文字起こしをしています…"}
            </p>
          </div>
          {segments.length > 0 && m.status === "transcribing" && (
            <p className="mt-2 text-sm text-(--color-dim)">
              区間 {segments.filter((s) => s.status === "transcribed").length} / {segments.length} 完了
              {failedSegs.length ? `（失敗 ${failedSegs.length}）` : ""}
            </p>
          )}
          {note && <p className="mt-2 text-sm text-(--color-dim)">{note}</p>}
          <p className="mt-3 text-xs text-(--color-dim)">この画面を閉じても、開き直すと続きから進みます。</p>
        </section>
      )}

      {failedSegs.some((s) => s.hasAudio) && m.status !== "confirmed" && (
        <section className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          文字起こしできなかった区間があります（{failedSegs.map((s) => `区間${s.idx + 1}: ${s.error ?? ""}`).join(" / ")}）
          <form action={async () => { await retrySegments(m.id); router.refresh(); }}>
            <button className={btnGhostCls}>その区間をやり直す</button>
          </form>
        </section>
      )}

      {(m.status === "summarized" || m.status === "failed") && m.summary && (
        <Editor meeting={m} modes={modes} onNote={setNote} />
      )}
      {m.status === "failed" && !m.summary && (
        <section className={cardCls}>
          <p className="text-sm">処理に失敗しました。{m.transcript ? "要約だけやり直せます。" : ""}</p>
          {m.transcript && (
            <button className={`${btnCls} mt-3`} onClick={() => void proceed()}>
              要約をやり直す
            </button>
          )}
        </section>
      )}

      {m.status === "confirmed" && <Confirmed meeting={m} />}

      {note && !["transcribing", "transcribed", "summarizing"].includes(m.status) && (
        <p className="text-sm text-(--color-dim)">{note}</p>
      )}

      {m.transcript && <TranscriptPanel meeting={m} />}

      <div className="flex justify-end pt-4">
        <form
          action={async () => {
            if (!confirm("この議事録を削除します。よろしいですか？（音声・文字起こしも消えます）")) return;
            await deleteMeeting(m.id);
          }}
        >
          <button className={btnDangerCls}>削除</button>
        </form>
      </div>
    </div>
  );
}

function ResumeRecording({ id, count }: { id: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm">
        録音の途中で画面が閉じられたようです。届いている {count} 区間で議事録を作れます。
      </p>
      <button
        disabled={busy}
        className={btnCls}
        onClick={async () => {
          setBusy(true);
          await endRecording(id);
          router.refresh();
        }}
      >
        届いた区間で議事録へ進む
      </button>
    </div>
  );
}

function FileUpload({ id, maxBytes }: { id: string; maxBytes: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (f.size > maxBytes) {
      setErr(`ファイルが大きすぎます（${Math.round(maxBytes / 1024 / 1024)}MBまで）。録音アプリの音質を下げるか、分けて取り込んでください`);
      return;
    }
    const mime = f.type || "audio/mp4";
    setBusy("音声を送っています…");
    try {
      const up = await createSegmentUploadUrl(id, 0, mime);
      if (!up.url || !up.path) throw new Error(up.error ?? "URLを発行できませんでした");
      const res = await fetch(up.url, { method: "PUT", headers: { "Content-Type": mime }, body: f });
      if (!res.ok) throw new Error(`アップロードに失敗しました（HTTP ${res.status}）`);
      const fin = await finishSegment(id, { idx: 0, path: up.path, bytes: f.size, seconds: null, offsetSeconds: 0, mime });
      if (fin.error) throw new Error(fin.error);
      await endRecording(id);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "送れませんでした");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={`${cardCls} space-y-3`}>
      <h3 className="font-semibold">音声ファイルを選ぶ</h3>
      <input type="file" accept="audio/*,video/mp4,video/webm" disabled={Boolean(busy)} onChange={(e) => onFile(e.target.files?.[0])} />
      <p className="text-xs text-(--color-dim)">
        m4a / mp3 / wav / webm など。1時間を超える録音は時間がかかり、途中で止まることがあります（長い会議は「その場で録音」がおすすめです）。
      </p>
      {busy && <p className="text-sm text-(--color-accent)">{busy}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}

function TextPaste({ id }: { id: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className={`${cardCls} space-y-3`}>
      <h3 className="font-semibold">文字起こしを貼り付け</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className={`${inputCls} font-mono`} placeholder={"[00:00:05] 古川: では始めます\n[00:00:12] 田中: よろしくお願いします"} />
      <p className="text-xs text-(--color-dim)">「話者名: 発言」の形だと、要約で誰の発言かを正しく残せます。</p>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        disabled={busy || text.trim().length < 20}
        className={btnCls}
        onClick={async () => {
          setBusy(true);
          const r = await setTranscriptText(id, text);
          if (r.error) {
            setErr(r.error);
            setBusy(false);
            return;
          }
          router.refresh();
        }}
      >
        取り込んで要約する
      </button>
    </section>
  );
}

const CHECK_LABEL: Record<QuoteCheck, { text: string; cls: string }> = {
  ok: { text: "発言あり", cls: "text-emerald-700" },
  near: { text: "言い回し違い", cls: "text-amber-700" },
  none: { text: "発言が見当たらない", cls: "text-red-700 font-medium" },
};

function Evidence({ item }: { item: { q: string; check?: QuoteCheck } }) {
  if (!item.q) return <span className="text-xs text-red-700">根拠の発言なし</span>;
  const c = item.check ? CHECK_LABEL[item.check] : null;
  return (
    <span className="block text-xs text-(--color-dim)">
      「{item.q}」{c && <span className={`ml-1 ${c.cls}`}>[{c.text}]</span>}
    </span>
  );
}

function ItemList({ title, items }: { title: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold">{title}</h4>
      <ul className="space-y-2">
        {items.map((x, i) => (
          <li key={i} className={`rounded-md border-l-2 pl-3 ${x.check === "none" ? "border-red-400 bg-red-50/40" : "border-(--color-line)"}`}>
            <span className="text-sm">{x.text}</span>
            <Evidence item={x} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Editor({ meeting: m, modes, onNote }: { meeting: ViewMeeting; modes: { id: string; label: string }[]; onNote: (s: string | null) => void }) {
  const router = useRouter();
  const [body, setBody] = useState(m.draftBody);
  const [todos, setTodos] = useState<Todo[]>(m.todos);
  const [mode, setMode] = useState(m.mode === "auto" ? "general" : m.mode);
  const [busy, setBusy] = useState<string | null>(null);
  const s = m.summary!;

  const resummarize = async () => {
    if (!confirm("いまの本文の編集は消えて、要約を作り直します。よろしいですか？")) return;
    setBusy("要約を作り直しています…");
    const r = await requestSummary(m.id, mode);
    setBusy(null);
    onNote(r.error ?? null);
    router.refresh();
  };

  const confirmIt = async () => {
    setBusy("確定しています…");
    const r = await confirmMeeting(m.id, body, todos);
    setBusy(null);
    if (r.error) onNote(r.error);
    router.refresh();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={`${cardCls} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">AIの下書き</h3>
          <span className="text-xs text-(--color-dim)">
            種類: {m.modeLabel ?? "—"}
            {m.modeSuggested && m.modeSuggested === m.mode ? "（AIの判定）" : ""}
          </span>
        </div>
        {m.unverified > 0 && (
          <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
            根拠の発言が文字起こしに見当たらない項目が {m.unverified} 件あります（赤い線）。AIの作文の可能性があるので、確かめてから本文に残してください。
          </p>
        )}
        {s.overview && <p className="text-sm leading-relaxed">{s.overview}</p>}
        <ItemList title="決定事項" items={s.decisions} />
        {m.sections.map((sec) => (
          <ItemList key={sec.key} title={sec.label} items={s.sections[sec.key] ?? []} />
        ))}
        <ItemList title="未決事項・持ち越し" items={s.open} />
        {s.todos.length > 0 && (
          <div>
            <h4 className="mb-1 text-sm font-semibold">ToDo</h4>
            <ul className="space-y-2">
              {s.todos.map((t, i) => (
                <li key={i} className={`border-l-2 pl-3 ${t.check === "none" ? "border-red-400" : "border-(--color-line)"}`}>
                  <span className="text-sm">
                    {t.task}
                    {(t.owner || t.due) && <span className="text-(--color-dim)">（{[t.owner, t.due].filter(Boolean).join(" / ")}）</span>}
                  </span>
                  <Evidence item={t} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-(--color-line) pt-4">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${inputCls} w-auto`}>
            {modes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <button disabled={Boolean(busy)} onClick={resummarize} className={btnGhostCls}>
            この種類で作り直す
          </button>
        </div>
      </section>

      <section className={`${cardCls} space-y-4`}>
        <div>
          <h3 className="font-semibold">議事録（確認して確定）</h3>
          <p className="text-xs text-(--color-dim)">ここで確定した本文とToDoだけが正式な議事録になります。</p>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} className={`${inputCls} leading-relaxed`} />
        <TodoTable todos={todos} onChange={setTodos} />
        <button disabled={Boolean(busy) || !body.trim()} onClick={confirmIt} className={`${btnCls} w-full py-3`}>
          確認して確定する
        </button>
        {busy && <p className="text-sm text-(--color-accent)">{busy}</p>}
      </section>
    </div>
  );
}

function TodoTable({ todos, onChange, readOnly = false }: { todos: Todo[]; onChange?: (t: Todo[]) => void; readOnly?: boolean }) {
  const set = (i: number, k: keyof Todo, v: string) => onChange?.(todos.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  if (readOnly && !todos.length) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">ToDo</h4>
      <div className="space-y-2">
        {todos.map((t, i) =>
          readOnly ? (
            <div key={i} className="flex flex-wrap gap-x-3 text-sm">
              <span className="flex-1">・{t.task}</span>
              <span className="text-(--color-dim)">{t.owner || "担当未定"}</span>
              <span className="text-(--color-dim)">{t.due || "期限未定"}</span>
            </div>
          ) : (
            <div key={i} className="grid grid-cols-[1fr_7rem_7rem_auto] gap-2">
              <input value={t.task} onChange={(e) => set(i, "task", e.target.value)} className={inputCls} />
              <input value={t.owner} onChange={(e) => set(i, "owner", e.target.value)} placeholder="担当" className={inputCls} />
              <input value={t.due} onChange={(e) => set(i, "due", e.target.value)} placeholder="期限" className={inputCls} />
              <button onClick={() => onChange?.(todos.filter((_, j) => j !== i))} className="px-2 text-(--color-dim) hover:text-red-600" aria-label="削除">
                ×
              </button>
            </div>
          )
        )}
        {!readOnly && (
          <button onClick={() => onChange?.([...todos, { task: "", owner: "", due: "", q: "" }])} className={btnGhostCls}>
            ＋ ToDoを追加
          </button>
        )}
      </div>
    </div>
  );
}

function Confirmed({ meeting: m }: { meeting: ViewMeeting }) {
  const router = useRouter();
  return (
    <section className={`${cardCls} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">議事録（確定済み）</h3>
        <div className="flex gap-2">
          <Link href={`/m/${m.id}/print`} className={btnGhostCls} target="_blank">
            印刷・PDF
          </Link>
          <button
            className={btnGhostCls}
            onClick={async () => {
              await navigator.clipboard.writeText(m.draftBody);
            }}
          >
            本文をコピー
          </button>
          <form action={async () => { await reopenMeeting(m.id); router.refresh(); }}>
            <button className={btnGhostCls}>確定を取り消す</button>
          </form>
        </div>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{m.draftBody}</pre>
      <TodoTable todos={m.todos} readOnly />
      {m.transcriptExpiresAt && (
        <p className="text-xs text-(--color-dim)">
          文字起こしは {m.transcriptExpiresAt.slice(0, 10)} に自動で削除されます（L2）。確定した本文は残ります。
        </p>
      )}
    </section>
  );
}

function TranscriptPanel({ meeting: m }: { meeting: ViewMeeting }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(m.rawSpeakers.map((k) => [k, m.speakers[k] ?? ""]))
  );
  const [saved, setSaved] = useState(false);
  return (
    <section className={cardCls}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="font-semibold">文字起こし・話者名</span>
        <span className="text-sm text-(--color-dim)">{open ? "閉じる" : "開く"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          {m.rawSpeakers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-(--color-dim)">
                話者に名前を付けると、文字起こしの表示と、次に作る要約に反映されます（確定前なら「この種類で作り直す」で要約にも入ります）。
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {m.rawSpeakers.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-20 shrink-0 text-(--color-dim)">{k}</span>
                    <input
                      value={names[k] ?? ""}
                      onChange={(e) => {
                        setSaved(false);
                        setNames({ ...names, [k]: e.target.value });
                      }}
                      placeholder="名前"
                      className={inputCls}
                    />
                  </label>
                ))}
              </div>
              <button
                className={btnGhostCls}
                onClick={async () => {
                  await saveSpeakers(m.id, names);
                  setSaved(true);
                  router.refresh();
                }}
              >
                {saved ? "保存しました" : "話者名を保存"}
              </button>
            </div>
          )}
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-(--color-panel-2) p-3 font-sans text-sm leading-relaxed">
            {m.transcript}
          </pre>
        </div>
      )}
    </section>
  );
}
