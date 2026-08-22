"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { estimatePhases, type Phases } from "@/lib/phases";
import { CLUBS } from "@/lib/lesson";

/**
 * 撮影モジュール（DECISIONS #51 / 2026-08-22 ガイド線を廃止）
 *
 * ガイド（後方DTL・正面フェースオンの枠線＋説明テキスト）は削除した。
 * 理由: 実機では説明テキストが枠幅からはみ出て切れ、線も被写体に重なって
 *       かえって構図が取りづらい、とユーザーから指摘（2026-08-22）。
 *       画角を揃えたいだけなら、9:16の固定枠に収めてもらえば足りる。
 * ※ 復活させる場合は、SVGのviewBox幅(90)を超える長さのtextを置かないこと。
 *
 * レイアウト: プレビューは 9:16 固定枠（object-cover）。
 * シャッターはプレビュー上に重ねる（カメラアプリと同じ）ので、スクロールしても必ず押せる。
 *
 * 2026-08-22: 撮ったあとの「クラブ・飛距離・メモ → 登録」までこの画面で完結させた。
 * それまでは【この動画を使う】で閉じたあと、カルテを下までスクロールして【⬆登録】を
 * 押す必要があり、打った直後の現場では確実に忘れる導線だった。
 */

const MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export type Captured = { blob: Blob; url: string; ext: string; phases: Phases | null; duration: number };

export type RecordMeta = { club: string; distanceYd: string; note: string; shotAt: string };

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function SwingRecorder({
  onRegister,
  onClose,
}: {
  /** 登録処理。エラー文字列を返せば画面に出す。null なら成功でこのモジュールを閉じる */
  onRegister: (c: Captured, meta: RecordMeta) => Promise<string | null>;
  onClose: () => void;
}) {
  const camRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [limit, setLimit] = useState(8);
  const [count, setCount] = useState<number | null>(null);
  const [rec, setRec] = useState(false);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Captured | null>(null);
  const [ready, setReady] = useState(false);
  const [club, setClub] = useState("");
  const [dist, setDist] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const supported =
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const stopStream = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
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
        await camRef.current.play().catch(() => {});
      }
      setReady(true);
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
    else setRec(false);
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setSaveErr(null);
  };

  const register = async () => {
    if (!preview) return;
    setSaveErr(null);
    setSaving("登録中…");
    const err = await onRegister(preview, { club, distanceYd: dist, note, shotAt: jstToday() });
    setSaving(null);
    if (err) { setSaveErr(err); return; }
    URL.revokeObjectURL(preview.url);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black">
      {/* ヘッダ */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm">
        <span className="font-medium text-(--color-gold)">スイング撮影</span>
        <button onClick={() => { stopStream(); onClose(); }} className="btn-ghost ml-auto !py-1.5">✕ 閉じる</button>
      </div>

      {!supported ? (
        <div className="m-4 rounded-xl border border-(--color-line) bg-(--color-panel) p-4 text-sm text-(--color-dim)">
          この端末のブラウザはアプリ内録画に対応していません。カメラアプリで撮影してから「動画を選ぶ」で登録してください。
        </div>
      ) : preview ? (
        /* ---- 撮り終わり: ここで登録まで終わらせる ---- */
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
          <div className="mx-auto w-full max-w-[440px]">
            <video src={preview.url} controls playsInline autoPlay loop muted className="max-h-[45vh] w-full rounded-lg bg-black" />
            <p className="mt-2 text-xs text-(--color-dim)">
              {preview.phases?._method === "audio"
                ? "✅ 打球音からインパクトを検出し、アドレス〜フィニッシュを自動マークしました"
                : preview.phases
                ? "⚠ 打球音を検出できず、尺から仮の位置を置きました（再生画面で調整できます）"
                : "⚠ フェーズは自動で置けませんでした（再生画面で手動設定できます）"}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-(--color-dim)">
                クラブ
                <select value={club} onChange={(e) => setClub(e.target.value)} className="input-dark mt-1 w-full">
                  <option value="">未選択</option>
                  {CLUBS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="text-xs text-(--color-dim)">
                飛距離(yd)
                <input value={dist} onChange={(e) => setDist(e.target.value)} inputMode="numeric" placeholder="—" className="input-dark mt-1 w-full" />
              </label>
              <label className="col-span-2 text-xs text-(--color-dim)">
                メモ
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 切り返しを緩めた" className="input-dark mt-1 w-full" />
              </label>
            </div>

            {saveErr && <p className="mt-2 text-xs text-(--color-danger)">{saveErr}</p>}

            <div className="mt-3 flex gap-2">
              <button onClick={retake} disabled={!!saving} className="btn-ghost">↺ 撮り直す</button>
              <button onClick={register} disabled={!!saving} className="btn-gold flex-1">
                {saving ?? "この動画を登録する"}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-(--color-dim)">
              クラブ・飛距離はあとからでも直せます。まず登録してしまってください
            </p>
          </div>
        </div>
      ) : (
        /* ---- 撮影 ---- */
        <div className="flex min-h-0 flex-1 flex-col items-center px-3 pb-3">
          {/* 9:16固定枠 */}
          <div className="relative mx-auto aspect-[9/16] max-h-full w-full max-w-[440px] shrink overflow-hidden rounded-xl bg-black">
            <video
              ref={camRef}
              muted
              playsInline
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />

            {count !== null && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-8xl font-bold text-(--color-gold)">
                {count}
              </div>
            )}
            {rec && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-sm text-white">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                REC 残り{left}秒
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-(--color-txt)">{busy}</div>
            )}

            {/* シャッター（プレビュー上に固定＝必ず押せる） */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent pb-4 pt-8">
              <button
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                disabled={rec || count !== null}
                className="text-2xl text-white disabled:opacity-30"
                aria-label="カメラ切替"
              >
                🔄
              </button>
              {rec || count !== null ? (
                <button
                  onClick={stopNow}
                  aria-label="停止"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-red-600"
                >
                  <span className="h-6 w-6 rounded bg-white" />
                </button>
              ) : (
                <button
                  onClick={record}
                  disabled={!ready || !!busy}
                  aria-label="録画開始"
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/10 disabled:opacity-40"
                >
                  <span className="h-14 w-14 rounded-full bg-red-600" />
                </button>
              )}
              <span className="w-6 text-center text-xs text-white/80">{limit}s</span>
            </div>
          </div>

          {err && <p className="mt-2 text-xs text-(--color-danger)">{err}</p>}

          {/* 秒数（シャッターとは別・下段） */}
          <div className="mt-2 flex w-full max-w-[440px] shrink-0 flex-wrap items-center justify-center gap-1.5 text-xs">
            {[5, 8, 12].map((s) => (
              <button
                key={s}
                onClick={() => setLimit(s)}
                disabled={rec || count !== null}
                className={`rounded-lg border px-2.5 py-1.5 ${limit === s ? "border-(--color-gold) text-(--color-gold)" : "border-(--color-line) text-(--color-dim)"}`}
              >
                {s}秒
              </button>
            ))}
          </div>
          <p className="mt-1.5 shrink-0 text-center text-[11px] text-(--color-dim)">
            3秒カウントダウン後に自動で録画開始・{limit}秒で自動停止 ／ マイクを塞がないでください（打球音でインパクトを検出）
          </p>
        </div>
      )}
    </div>
  );
}
