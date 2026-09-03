"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  startVoiceNote, createNotePartUploadUrl, finishNoteParts,
  createNoteUploadUrl, finishNoteUpload,
} from "./note-actions";

/**
 * 録音バー（2026-09-03）
 *
 * **レイアウトに置いてある**のがこの部品の肝。
 * 現場の使い方は「録音しながら症状を検索する」なので、
 * 画面を移っても録音が切れてはいけない。
 * ページの中に置くと遷移で作り直されて録音が止まるため、layout.tsx に置いている。
 *
 * 流れ: 同意チェック → 録音（5秒ごとに送っておく） → 停止 → 残りを送る → 要約は投げっぱなし
 *       → 下書きは /note で直して保存
 */

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
/** iOS Safari は codecs 付きの type を扱えない（#153 の教訓）。素の type に落とす */
const baseMime = (m: string) => (m.split(";")[0] || "audio/webm").trim();
const extOf = (m: string) => (m.includes("mp4") ? "m4a" : m.includes("ogg") ? "ogg" : "webm");
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type WakeLock = { release: () => Promise<void> };

export default function VoiceBar() {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [rec, setRec] = useState(false);
  const [sec, setSec] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<WakeLock | null>(null);
  const secRef = useRef(0);

  /* 録音しながら送るための入れもの（lesson-os #201 と同じ）
     all … 丸ごと（分割が失敗したときの逃げ道） / queue … 未送信 / parts … 送り終えた断片 */
  const all = useRef<BlobPart[]>([]);
  const queue = useRef<BlobPart[]>([]);
  const parts = useRef<string[]>([]);
  const partIdx = useRef(0);
  const broken = useRef(false);
  const pumping = useRef(false);

  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
  }, []);

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

  /** 録音中に溜まった塊を送る。順番を崩さないよう1本ずつ */
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
      // 分割は諦めて、止めたときに丸ごと送り直す
      broken.current = true;
    } finally {
      pumping.current = false;
    }
  }, []);

  /** 要約を投げる（待たない）。結果は /note に出る */
  const summarize = (id: string) => {
    void fetch("/api/voice-note/summarize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ noteId: id }),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((out: { error?: string }) => { if (out.error) setMsg(out.error); })
      .catch(() => { /* 画面を閉じただけのこともある。状態はDBが持っている */ });
  };

  const upload = async (mime: string) => {
    const id = noteIdRef.current;
    const seconds = secRef.current;
    cleanup();
    if (!id) { setMsg("録音が空でした"); return; }
    setBusy("音声を送っています…");
    try {
      let ok = false;
      if (!broken.current) {
        await pump(mime, true);
        if (!broken.current && parts.current.length) {
          const fin = await finishNoteParts(id, parts.current, seconds);
          if (!fin.error) ok = true;
        }
      }
      if (!ok) {
        const blob = new Blob(all.current, { type: mime });
        if (!blob.size) { setMsg("録音が空でした"); return; }
        const up = await createNoteUploadUrl(id, extOf(mime), blob.size);
        if (up.error || !up.url || !up.path) { setMsg(up.error ?? "アップロードに失敗しました"); return; }
        const res = await fetch(up.url, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
        if (!res.ok) { setMsg("アップロードに失敗しました"); return; }
        const fin = await finishNoteUpload(id, up.path, seconds, blob.size, parts.current);
        if (fin.error) { setMsg(fin.error); return; }
      }
      summarize(id);
      setDone(true);
      setMsg("AIが下書きを作っています。そのまま次の作業を続けて大丈夫です");
    } finally {
      setBusy(null);
      all.current = [];
      queue.current = [];
      parts.current = [];
      noteIdRef.current = null;
      setSec(0);
      secRef.current = 0;
    }
  };

  const start = async () => {
    setMsg(null);
    setDone(false);
    const made = await startVoiceNote(consent);
    if (made.error || !made.id) { setMsg(made.error ?? "録音を始められませんでした"); return; }
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
        void pump(base);
      };
      mr.onstop = () => void upload(base);
      recRef.current = mr;
      mr.start(5000);
      setRec(true);
      setSec(0);
      secRef.current = 0;
      timer.current = setInterval(() => {
        secRef.current += 1;
        setSec(secRef.current);
      }, 1000);
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

  if (!supported) return null;

  // 録音中は常に見えるバー。それ以外は小さく畳んでおく（検索の邪魔をしない）
  return (
    <div className="sticky top-[52px] z-10 border-b border-(--color-line) bg-white/95 px-4 py-2 backdrop-blur">
      {rec ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-bold text-rose-600">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
            録音中 {mmss(sec)}
          </span>
          <span className="text-[11px] text-slate-500">このまま症状を検索して大丈夫です</span>
          <button
            onClick={stop}
            className="ml-auto rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            ■ 止めてコメントを作る
          </button>
        </div>
      ) : busy ? (
        <div className="text-xs text-slate-500">{busy}</div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-bold text-teal-700"
          >
            🎙 レッスンを記録する
          </button>
          {done && (
            <Link href="/note" className="text-xs font-bold text-teal-700 underline">
              下書きを見る →
            </Link>
          )}
          <span className="ml-auto text-[11px] text-slate-400">録音はコメント作成のためだけに使い、要約後に消えます</span>
        </div>
      )}

      {open && !rec && !busy && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              お客様に録音の説明をして、同意をいただきました。
              <span className="block text-[11px] text-slate-500">
                「レッスンの記録のために録音させていただいてもよろしいでしょうか。メモができたら音声は消します」
              </span>
            </span>
          </label>
          <div className="mt-2 flex items-center gap-2">
            <button
              disabled={!consent}
              onClick={() => { setOpen(false); void start(); }}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white disabled:bg-slate-300"
            >
              🎙 録音を始める
            </button>
            <span className="text-[11px] text-slate-500">30分を超えるときは前半・後半で分けてください</span>
          </div>
        </div>
      )}

      {msg && <div className="mt-2 text-[11px] text-slate-600">{msg}</div>}
    </div>
  );
}
