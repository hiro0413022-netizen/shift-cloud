"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { estimatePhases, type Phases } from "@/lib/phases";

/**
 * 撮影モジュール（DECISIONS #51）
 * アプリ内でそのままスイングを録画する。レッスン中に片手で完結させることを最優先。
 * - 構え位置ガイド（センター線・前傾線・地面線）を重ねて、毎回同じ画角で撮れる
 * - カウントダウン → 自動停止（5/8/12秒）でスマホを触りに戻る必要がない
 * - 音声も録る（打球音＝インパクト自動検出の基準になるため必須）
 * - 撮り終わった直後にフェーズを自動推定して、そのまま登録できる
 * MediaRecorder非対応の端末（古いiOS等）は端末カメラ起動にフォールバック。
 */

const MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export type Captured = { blob: Blob; url: string; ext: string; phases: Phases | null; duration: number };

export function SwingRecorder({
  onDone,
  onClose,
}: {
  onDone: (c: Captured) => void;
  onClose: () => void;
}) {
  const camRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [limit, setLimit] = useState(8);
  const [guide, setGuide] = useState(true);
  const [count, setCount] = useState<number | null>(null); // 3,2,1
  const [rec, setRec] = useState(false);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Captured | null>(null);
  const supported =
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const stopStream = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setErr(null);
    stopStream();
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: true, // 打球音でインパクトを検出するため必須
      });
      streamRef.current = s;
      if (camRef.current) {
        camRef.current.srcObject = s;
        void camRef.current.play();
      }
    } catch {
      setErr("カメラを起動できませんでした。ブラウザのカメラ許可を確認してください");
    }
  }, [facing, stopStream]);

  useEffect(() => {
    if (supported && !preview) void start();
    return stopStream;
  }, [supported, preview, start, stopStream]);

  const record = () => {
    const s = streamRef.current;
    if (!s) return;
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    chunks.current = [];
    const mr = new MediaRecorder(s, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    recRef.current = mr;
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    mr.onstop = async () => {
      setRec(false);
      const blob = new Blob(chunks.current, { type: mime || "video/webm" });
      setBusy("フェーズを自動推定中…");
      const phases = await estimatePhases(blob, limit);
      setBusy(null);
      setPreview({ blob, url: URL.createObjectURL(blob), ext, phases, duration: limit });
      stopStream();
    };

    // 3-2-1 カウントダウン → 録画 → 自動停止
    setCount(3);
    [1, 2].forEach((i) => timers.current.push(setTimeout(() => setCount(3 - i), i * 1000)));
    timers.current.push(
      setTimeout(() => {
        setCount(null);
        setRec(true);
        setLeft(limit);
        mr.start();
        for (let i = 1; i <= limit; i++) timers.current.push(setTimeout(() => setLeft(limit - i), i * 1000));
        timers.current.push(setTimeout(() => mr.state !== "inactive" && mr.stop(), limit * 1000));
      }, 3000)
    );
  };

  const stopNow = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCount(null);
    if (recRef.current?.state === "recording") recRef.current.stop();
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const Guides = () =>
    guide ? (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <line x1="50" y1="0" x2="50" y2="100" stroke="#7CFC66" strokeWidth="0.25" strokeDasharray="2 2" opacity="0.7" />
        <line x1="0" y1="88" x2="100" y2="88" stroke="#4dd2ff" strokeWidth="0.25" strokeDasharray="2 2" opacity="0.7" />
        <line x1="30" y1="92" x2="72" y2="22" stroke="#ffd54d" strokeWidth="0.25" opacity="0.6" />
        <rect x="34" y="12" width="32" height="80" fill="none" stroke="#ffffff" strokeWidth="0.2" opacity="0.25" />
      </svg>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-(--color-txt)">
        <span className="font-medium text-(--color-gold)">スイング撮影</span>
        <button onClick={() => { stopStream(); onClose(); }} className="ml-auto btn-ghost !py-1.5">✕ 閉じる</button>
      </div>

      {!supported ? (
        <div className="m-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-4 text-sm text-(--color-dim)">
          <p>この端末のブラウザはアプリ内録画に対応していません。カメラアプリで撮影してから「動画を選ぶ」で登録してください。</p>
        </div>
      ) : preview ? (
        /* ---- 撮り終わり: 確認 → 使う / 撮り直す ---- */
        <div className="flex-1 overflow-auto px-4">
          <div className="relative mx-auto max-w-2xl overflow-hidden rounded-lg bg-black">
            <video src={preview.url} controls playsInline autoPlay loop className="max-h-[62vh] w-full" />
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-xs text-(--color-dim)">
            {preview.phases?._method === "audio"
              ? "✅ 打球音からインパクトを検出し、アドレス〜フィニッシュを自動でマークしました（再生画面で微調整できます）"
              : preview.phases
              ? "⚠ 打球音を検出できず、尺から仮の位置を置きました（再生画面で調整してください）"
              : "⚠ フェーズは自動で置けませんでした（再生画面で手動設定できます）"}
          </p>
          <div className="mx-auto mt-3 flex max-w-2xl gap-2">
            <button onClick={retake} className="btn-ghost">↺ 撮り直す</button>
            <button onClick={() => onDone(preview)} className="btn-gold flex-1">この動画を使う</button>
          </div>
        </div>
      ) : (
        /* ---- 撮影中 ---- */
        <div className="flex flex-1 flex-col px-4">
          <div className="relative mx-auto w-full max-w-2xl flex-1 overflow-hidden rounded-lg bg-black">
            <video
              ref={camRef}
              muted
              playsInline
              className="h-full w-full object-contain"
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
            <Guides />
            {count !== null && (
              <div className="absolute inset-0 flex items-center justify-center text-8xl font-bold text-(--color-gold)">{count}</div>
            )}
            {rec && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-sm text-white">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                REC 残り{left}秒
              </div>
            )}
            {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-(--color-txt)">{busy}</div>}
          </div>

          {err && <p className="mx-auto mt-2 max-w-2xl text-xs text-(--color-danger)">{err}</p>}

          <div className="mx-auto mt-3 w-full max-w-2xl space-y-2 pb-4">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[5, 8, 12].map((s) => (
                <button
                  key={s}
                  onClick={() => setLimit(s)}
                  disabled={rec}
                  className={`rounded-lg border px-2.5 py-1.5 ${limit === s ? "border-(--color-gold) text-(--color-gold)" : "border-(--color-line) text-(--color-dim)"}`}
                >
                  {s}秒
                </button>
              ))}
              <span className="mx-1 text-(--color-line)">|</span>
              <button onClick={() => setGuide((g) => !g)} className="btn-ghost !px-2 !py-1.5">
                {guide ? "ガイド線 ON" : "ガイド線 OFF"}
              </button>
              <button
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                disabled={rec}
                className="btn-ghost !px-2 !py-1.5"
              >
                🔄 カメラ切替
              </button>
            </div>
            {rec || count !== null ? (
              <button onClick={stopNow} className="w-full rounded-xl bg-red-600 py-4 text-base font-semibold text-white">
                ■ 停止
              </button>
            ) : (
              <button onClick={record} disabled={!streamRef.current || !!busy} className="btn-gold w-full !py-4 !text-base">
                ● 3秒後に{limit}秒間 録画
              </button>
            )}
            <p className="text-center text-[11px] text-(--color-dim)">
              打球音でインパクトを自動検出します。マイクを塞がないでください
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
