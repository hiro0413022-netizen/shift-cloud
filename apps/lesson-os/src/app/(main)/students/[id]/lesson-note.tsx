"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startLessonNote, createNoteUploadUrl, finishNoteUpload, saveLessonNote,
  createNotePartUploadUrl, finishNoteParts, setNoteVideo,
  deleteNoteAudio, deleteNoteTranscript, removeLessonNote, loadLessonNote,
  listCompanySymptoms, setNoteSymptomRejected, addNoteSymptom,
  type LessonNoteItem, type SymptomOption,
} from "./actions";

/**
 * 会話メモ（レッスンの会話の録音 → AI要約 → コーチが確認して確定）2026-08-28 / 2026-09-03 改訂
 *
 * 順番:
 *   同意を確認（チェックしないと録音ボタンが押せない）
 *   → 録音（画面が消えないよう Wake Lock を取る・**録音しながら5秒ずつ送る**）
 *   → 停止で残りを送って結合
 *   → 要約は**裏で走る**。コーチは待たずに次の作業（撮影など）に移れる
 *   → **コーチが 先生の記録 と お客様への説明 を直して1回で保存**
 *   → 保存でその日の最後のスイング動画に紐づく（本日のレッスンに並ぶ）
 *   → 音声は要約が取れた時点で自動で消える
 *
 * 現場の前提:
 *   30〜50分の録音になるので、途中で画面が消えると録音が止まる端末がある。
 *   Wake Lock を取り、戻ってきたら取り直す。それでも切れる端末があるので、
 *   長いレッスンは前半・後半で2本に分けてもらう（画面にもそう書く）。
 */

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
/** iOS Safari は codecs 付きの type を扱えない（#153 の教訓）。素の type に落とす */
const baseMime = (m: string) => (m.split(";")[0] || "audio/webm").trim();
const extOf = (m: string) => (m.includes("mp4") ? "m4a" : m.includes("ogg") ? "ogg" : "webm");

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type WakeLock = { release: () => Promise<void> };

/** 紐づけ先に出すスイング動画（本日のレッスンと同じ並び＝新しい順） */
export type NoteVideo = { id: string; shotAt: string; club: string | null };

export function LessonNotePanel({
  studentId,
  initial,
  videos = [],
}: {
  studentId: string;
  initial: LessonNoteItem[];
  videos?: NoteVideo[];
}) {
  const [notes, setNotes] = useState<LessonNoteItem[]>(initial);
  const [consent, setConsent] = useState(false);
  const [rec, setRec] = useState(false);
  const [sec, setSec] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openTranscript, setOpenTranscript] = useState<string | null>(null);
  const [shareDrafts, setShareDrafts] = useState<Record<string, string>>({});
  /** 裏でAIが処理中のメモ。ここに入っている間は数秒おきに読み直す */
  const [working, setWorking] = useState<string[]>([]);
  /** 店のメソッド（AIカルテナレッジ）の症状一覧。手でタグを足すときだけ読む */
  const [options, setOptions] = useState<SymptomOption[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<WakeLock | null>(null);

  /* --- 録音しながら送るための入れもの（2026-09-03） -------------------
     all      … 録音まるごと。分割送信が失敗したときの逃げ道
     queue    … まだ送っていない塊
     parts    … 送り終えた断片のパス（この順に結合すると1本の音声になる）
     broken   … 一度でも送信に失敗したら true。以後は分割をやめて丸ごと送る  */
  const all = useRef<BlobPart[]>([]);
  const queue = useRef<BlobPart[]>([]);
  const parts = useRef<string[]>([]);
  const partIdx = useRef(0);
  const broken = useRef(false);
  const pumping = useRef(false);

  const supported =
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const keepAwake = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
      if (nav.wakeLock) wake.current = await nav.wakeLock.request("screen");
    } catch { /* 取れなくても録音は続く */ }
  }, []);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && rec) keepAwake(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [rec, keepAwake]);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wake.current?.release().catch(() => {});
    wake.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /* このパネルはタブを移っても閉じない作りにしたので、サーバー側が更新されても
     自動では入れ替わらない。サーバーの一覧が届いたら混ぜる（作りかけの行は残す）。 */
  useEffect(() => {
    setNotes((prev) => {
      const ids = new Set(initial.map((n) => n.id));
      return [...initial, ...prev.filter((n) => !ids.has(n.id))].sort((a, b) =>
        a.lessonDate === b.lessonDate ? 0 : a.lessonDate < b.lessonDate ? 1 : -1
      );
    });
  }, [initial]);

  const refresh = useCallback(async (id: string) => {
    const r = await loadLessonNote(id);
    if (r.note) setNotes((prev) => [r.note as LessonNoteItem, ...prev.filter((n) => n.id !== id)]);
    return r.note ?? null;
  }, []);

  /* 裏で走っているメモを数秒おきに見に行く。
     要約の本文は症状タグより先に入るので、途中経過がそのまま画面に出る。 */
  useEffect(() => {
    if (!working.length) return;
    const t = setInterval(() => {
      for (const id of working) void refresh(id);
    }, 6000);
    return () => clearInterval(t);
  }, [working, refresh]);

  /** 溜まった塊を1つの断片として送る。順番を崩さないよう1本ずつ */
  const pump = useCallback(async (mime: string, final = false) => {
    if (broken.current || pumping.current) return;
    if (!queue.current.length) return;
    const id = noteIdRef.current;
    if (!id) return;
    pumping.current = true;
    try {
      while (queue.current.length) {
        const take = queue.current.splice(0, queue.current.length);
        const blob = new Blob(take, { type: mime });
        const up = await createNotePartUploadUrl(id, partIdx.current, extOf(mime));
        if (!up.url || !up.path) { broken.current = true; return; }
        const res = await fetch(up.url, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
        if (!res.ok) { broken.current = true; return; }
        parts.current.push(up.path);
        partIdx.current += 1;
        if (final) break;
      }
    } catch {
      // 電波が切れただけかもしれないが、欠けた音声で要約すると嘘が混ざる。
      // 分割は諦めて、止めたときに丸ごと送り直す（録音は all に残っている）
      broken.current = true;
    } finally {
      pumping.current = false;
    }
  }, []);

  const start = async () => {
    setMsg(null);
    const made = await startLessonNote(studentId, jstToday(), consent);
    if (made.error || !made.id) { setMsg(made.error ?? "作成に失敗しました"); return; }
    noteIdRef.current = made.id;
    all.current = [];
    queue.current = [];
    parts.current = [];
    partIdx.current = 0;
    broken.current = false;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = s;
      const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const mr = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const base = baseMime(mr.mimeType || mime || "audio/webm");
      mr.ondataavailable = (e) => {
        if (!e.data.size) return;
        all.current.push(e.data);
        queue.current.push(e.data);
        // 録音中に送っておく＝止めてから送るぶんが最後の数秒だけになる
        void pump(base);
      };
      mr.onstop = () => void upload(base);
      recRef.current = mr;
      mr.start(5000); // 5秒ごとに切り出して溜める（途中で落ちてもそこまでは残る）
      setRec(true);
      setSec(0);
      timer.current = setInterval(() => setSec((v) => v + 1), 1000);
      keepAwake();
    } catch {
      setMsg("マイクを使えませんでした。ブラウザのマイク許可を確認してください");
    }
  };

  const stop = () => {
    setRec(false);
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    try { recRef.current?.stop(); } catch { /* すでに止まっている */ }
  };

  /**
   * 止めたあと。ここでコーチを待たせない:
   *   残りを送る → 要約は**投げっぱなし**にして、画面はポーリングで追いかける。
   *   タブを移っても（このパネルは閉じても消えない作りにしてある）処理は続く。
   */
  const upload = async (mime: string) => {
    const id = noteIdRef.current;
    cleanup();
    if (!id) { setMsg("録音が空でした"); return; }
    setBusy("音声を送っています…");
    try {
      let ok = false;
      // 1) 分割で送れているなら、残りだけ送って結合する（4Gでの待ちがほぼ消える）
      if (!broken.current) {
        await pump(mime, true);
        if (!broken.current && parts.current.length) {
          const fin = await finishNoteParts(id, parts.current, sec);
          if (!fin.error) ok = true;
        }
      }
      // 2) 分割が使えなかった／結合に失敗したときは、これまで通り丸ごと送る
      if (!ok) {
        const blob = new Blob(all.current, { type: mime });
        if (!blob.size) { setMsg("録音が空でした"); return; }
        const up = await createNoteUploadUrl(id, extOf(mime), blob.size);
        if (up.error || !up.url || !up.path) { setMsg(up.error ?? "アップロードに失敗しました"); return; }
        const res = await fetch(up.url, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
        if (!res.ok) { setMsg("アップロードに失敗しました"); return; }
        const fin = await finishNoteUpload(id, up.path, sec, blob.size, parts.current);
        if (fin.error) { setMsg(fin.error); return; }
      }

      await refresh(id);
      summarize(id);
      setMsg("AIが下書きを作っています。このまま次の作業を続けて大丈夫です");
    } finally {
      setBusy(null);
      all.current = [];
      queue.current = [];
      parts.current = [];
      noteIdRef.current = null;
      setSec(0);
    }
  };

  /** 要約を投げる（待たない）。結果はポーリングで画面に出る */
  const summarize = (id: string) => {
    setWorking((w) => (w.includes(id) ? w : [...w, id]));
    void fetch("/api/lesson-note/summarize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ noteId: id }),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((out: { error?: string; warning?: string }) => {
        if (out.error) setMsg(out.error);
      })
      .catch(() => { /* 画面を閉じただけのこともある。状態はDBが持っている */ })
      .finally(() => {
        void refresh(id);
        setWorking((w) => w.filter((x) => x !== id));
      });
  };

  const openAdd = async (id: string) => {
    setAdding(adding === id ? null : id);
    if (!options) {
      const r = await listCompanySymptoms();
      setOptions(r.options ?? []);
    }
  };

  /** 確認して保存。先生の記録・お客様への説明・動画への紐づけを1回で確定する */
  const save = async (id: string) => {
    const n = notes.find((x) => x.id === id);
    const text = drafts[id] ?? n?.body ?? "";
    const share = shareDrafts[id] ?? n?.shareBody ?? "";
    const r = await saveLessonNote(id, text, share);
    if (r.error) { setMsg(r.error); return; }
    await refresh(id);
    setMsg(
      r.videoId
        ? "保存しました。本日のレッスンのスイング動画に紐づきました"
        : "保存しました（この日のスイング動画がないので、日付のレッスンとして残しました）"
    );
  };

  if (!supported) {
    return <p className="text-sm text-(--color-dim)">この端末では録音が使えません。Chrome か Safari で開いてください。</p>;
  }

  return (
    <div className="space-y-4">
      {/* 録音 */}
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
        <p className="mb-2 text-sm font-medium text-(--color-gold)">レッスンの会話を録音してメモを作る</p>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={rec}
            className="mt-1"
          />
          <span>
            お客様に<strong>「レッスンの記録のために会話を録音し、メモを作ったら音声は消します」</strong>と説明し、
            同意をいただきました
          </span>
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!rec ? (
            <button onClick={start} disabled={!consent || !!busy} className="btn-gold disabled:opacity-40">
              🎙 録音を始める
            </button>
          ) : (
            <>
              <button onClick={stop} className="btn-gold !bg-red-600">■ 録音を止めてメモを作る</button>
              <span className="flex items-center gap-2 text-sm text-(--color-active)">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                録音中 {mmss(sec)}
              </span>
            </>
          )}
          {busy && <span className="text-sm text-(--color-active)">{busy}</span>}
        </div>

        <p className="mt-2 text-xs text-(--color-dim)">
          録音中は画面を消さないでください（消えると止まる端末があります）。
          <strong>30分を超えるレッスンは、前半・後半で2本に分けて</strong>録音してください。
          録音したぶんは<strong>録音しながら送っている</strong>ので、止めてからの待ちはほとんどありません。
          音声はメモができた時点で自動的に消えます。残るのは要約と、先生が直した本文だけです。
        </p>
        {rec && (
          <p className="mt-1 text-xs text-(--color-active)">
            録音したまま「本日のレッスン」に移って撮影できます（この画面を離れても録音は続きます）
          </p>
        )}
        {msg && <p className="mt-2 text-xs text-(--color-active)">{msg}</p>}
      </div>

      {/* 一覧 */}
      {notes.length === 0 && <p className="text-sm text-(--color-dim)">まだ会話メモがありません</p>}
      {notes.map((n) => {
        const draft = drafts[n.id] ?? n.body ?? "";
        const dayVideos = videos.filter((v) => v.shotAt === n.lessonDate);
        const inFlight = working.includes(n.id);
        return (
          <div key={n.id} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{n.lessonDate}</span>
              {n.coach && <span className="text-xs text-(--color-dim)">{n.coach}</span>}
              {n.seconds != null && <span className="text-xs text-(--color-dim)">{mmss(n.seconds)}</span>}
              <span
                className={`rounded px-2 py-0.5 text-xs ${n.status === "saved" ? "bg-(--color-gold)/20 text-(--color-gold)" : "bg-(--color-panel-2) text-(--color-dim)"}`}
              >
                {n.status === "saved" ? "確定済み" : n.status === "summarized" ? "下書き（要確認）" : n.status === "failed" ? "失敗" : "録音のみ"}
              </span>
              {inFlight && (
                <span className="flex items-center gap-1.5 rounded bg-(--color-active)/15 px-2 py-0.5 text-xs text-(--color-active)">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-active)" />
                  AIが作成中
                </span>
              )}
              {n.hasAudio && <span className="text-xs text-(--color-danger)">音声が残っています</span>}
              <button onClick={() => void removeLessonNote(n.id).then(() => setNotes((p) => p.filter((x) => x.id !== n.id)))} className="btn-ghost ml-auto !px-2 !py-1 text-xs">
                削除
              </button>
            </div>

            {n.error && <p className="mt-2 text-xs text-(--color-danger)">{n.error}</p>}
            {inFlight && !n.body && (
              <p className="mt-2 text-xs text-(--color-dim)">
                会話を聞いています。数分かかることがあります。<strong>この画面を離れても続きます</strong>ので、
                そのまま次のお客様の対応に移って大丈夫です。
              </p>
            )}

            {n.summary && (
              <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                {([
                  ["今日直したこと", n.summary.today],
                  ["次までの宿題", n.summary.homework],
                  ["本人の言葉", n.summary.studentWords],
                  ["次回みるところ", n.summary.next],
                ] as [string, string[]][])
                  .filter(([, v]) => v.length)
                  .map(([label, v]) => (
                    <div key={label}>
                      <span className="text-(--color-dim)">{label}</span>
                      <ul className="ml-4 list-disc">{v.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  ))}
                {n.summary.clubs.length > 0 && (
                  <div className="sm:col-span-2 text-(--color-dim)">クラブ: {n.summary.clubs.join(" / ")}</div>
                )}
              </div>
            )}

            {/* 店のメソッドへの紐づけ。AIは分類だけ、○×はコーチがタップで決める */}
            <div className="mt-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-(--color-gold)">症状タグ</span>
                {n.symptoms.length === 0 && <span className="text-(--color-dim)">まだありません</span>}
                {n.symptoms.map((t) => (
                  <button
                    key={t.id}
                    title={t.quote ? `根拠: ${t.quote}` : undefined}
                    onClick={() => void setNoteSymptomRejected(t.id, !t.rejected).then(() => refresh(n.id))}
                    className={`rounded-full border px-2.5 py-1 ${t.rejected ? "border-(--color-line) text-(--color-line) line-through" : "border-(--color-active) text-(--color-active)"}`}
                  >
                    {t.symptom}
                    {t.checkpoint ? ` / ${t.checkpoint}` : ""}
                    {t.source === "ai" && !t.rejected ? ` ${t.confidence}%` : ""}
                  </button>
                ))}
                <button onClick={() => void openAdd(n.id)} className="btn-ghost !px-2 !py-1">＋ 症状を足す</button>
              </div>
              {adding === n.id && (
                <select
                  className="input-dark mt-2 w-full text-xs"
                  defaultValue=""
                  onChange={(e) => {
                    const [sid, cid] = e.target.value.split("|");
                    if (!sid) return;
                    void addNoteSymptom(n.id, sid, cid || null).then(() => { setAdding(null); refresh(n.id); });
                  }}
                >
                  <option value="">症状を選ぶ…</option>
                  {(options ?? []).map((o) => (
                    <optgroup key={o.id} label={`${o.name}${o.category ? `（${o.category}）` : ""}`}>
                      <option value={`${o.id}|`}>{o.name}（確認項目を指定しない）</option>
                      {o.checkpoints.map((c) => (
                        <option key={c.id} value={`${o.id}|${c.id}`}>{o.name} / {c.title}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              <p className="mt-1 text-[11px] text-(--color-dim)">
                タップで外せます（外したものも記録に残り、AIの外れ方を直す材料になります）。
                タグが付くと「この生徒はこの症状が何回出たか」を後から数えられます。
              </p>
            </div>

            <label className="mt-2 block text-xs text-(--color-dim)">先生の記録（カルテに残る本文・お客様には出ません）</label>
            <textarea
              value={draft}
              onChange={(e) => setDrafts((p) => ({ ...p, [n.id]: e.target.value }))}
              rows={5}
              placeholder="AIの下書きがここに出ます。内容を確認して直してから保存してください"
              className="input-dark mt-1 w-full"
            />

            <label className="mt-2 block text-xs text-(--color-dim)">
              お客様への説明（お客様の画面に出ます・AIが今日の会話からお客様向けに書いた下書き）
            </label>
            <textarea
              value={shareDrafts[n.id] ?? n.shareBody ?? ""}
              onChange={(e) => setShareDrafts((p) => ({ ...p, [n.id]: e.target.value }))}
              rows={4}
              placeholder="AIの下書きがここに出ます。空のまま保存すると、お客様には何も出ません"
              className="input-dark mt-1 w-full"
            />

            {/* 紐づけ先。既定はその日の最後のスイング。違う動画に付け替えたいときだけ触る */}
            <label className="mt-2 block text-xs text-(--color-dim)">
              本日のレッスンのどのスイングに紐づけるか
              <select
                value={n.videoId ?? ""}
                onChange={(e) => void setNoteVideo(n.id, e.target.value || null).then(() => refresh(n.id))}
                className="input-dark mt-1 w-full text-xs"
              >
                <option value="">
                  {dayVideos.length ? "紐づけない（日付のレッスンとして残す）" : "この日のスイング動画はまだありません"}
                </option>
                {dayVideos.map((v) => (
                  <option key={v.id} value={v.id}>{v.shotAt}{v.club ? ` ${v.club}` : ""}</option>
                ))}
              </select>
            </label>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <button onClick={() => void save(n.id)} className="btn-gold !px-3 !py-1.5">確認して保存</button>
              {n.status === "failed" && !!n.hasAudio && (
                <button onClick={() => summarize(n.id)} disabled={inFlight} className="btn-ghost !px-2 !py-1.5">
                  もう一度AIに聞かせる
                </button>
              )}
              {n.transcript && (
                <button onClick={() => setOpenTranscript(openTranscript === n.id ? null : n.id)} className="btn-ghost !px-2 !py-1.5">
                  {openTranscript === n.id ? "文字起こしを閉じる" : "文字起こしを見る"}
                </button>
              )}
              {n.transcript && (
                <button onClick={() => void deleteNoteTranscript(n.id).then(() => refresh(n.id))} className="btn-ghost !px-2 !py-1.5">
                  文字起こしを消す
                </button>
              )}
              {n.hasAudio && (
                <button onClick={() => void deleteNoteAudio(n.id).then(() => refresh(n.id))} className="btn-ghost !px-2 !py-1.5">
                  音声を消す
                </button>
              )}
            </div>

            {openTranscript === n.id && n.transcript && (
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-(--color-panel-2) p-2 text-xs text-(--color-dim)">
                {n.transcript}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
