"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { estimatePhases, type Phases } from "@/lib/phases";

/**
 * 撮影モジュール（DECISIONS #51 / 修正: シャッター常時表示・アングル別ガイド）
 *
 * ガイドは撮影の定石に合わせて2種類（後方DTL / 正面フェースオン）を切替。
 * 共通の狙い（各社の撮影ガイドで共通する要件）:
 *   - カメラの高さは手元（腰）の高さ・水平
 *   - 頭の上に余白（トップでクラブが切れない）、足元にボールが入る
 *   - 人物は画面のやや下・中央
 *   - 後方(DTL)はターゲットラインと平行、後ろ足のつま先の延長線上から
 *   - 正面(フェースオン)はスタンス中央に正対
 * 画角が毎回変わると比較再生・フェーズ比較の意味が薄れるため、枠に合わせて撮ってもらう。
 *
 * レイアウト: プレビューは 9:16 固定枠（object-cover）＝ガイドと実映像がズレない。
 * シャッターはプレビュー上に重ねる（カメラアプリと同じ）ので、スクロールしても必ず押せる。
 */

const MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

type Angle = "dtl" | "faceon" | "off";

export type Captured = { blob: Blob; url: string; ext: string; phases: Phases | null; duration: number };

/** 後方（DTL）: ターゲットライン・つま先線・シャフトプレーン・頭の位置 */
function GuideDTL() {
  return (
    <svg viewBox="0 0 90 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {/* 人物を収める枠（頭上に余白・足元にボール） */}
      <rect x="22" y="20" width="46" height="118" fill="none" stroke="#ffffff" strokeWidth="0.4" opacity="0.3" strokeDasharray="3 3" />
      {/* 頭の目安 */}
      <circle cx="45" cy="30" r="7" fill="none" stroke="#7CFC66" strokeWidth="0.5" opacity="0.8" />
      {/* ターゲットライン（足元・水平） */}
      <line x1="4" y1="132" x2="86" y2="132" stroke="#4dd2ff" strokeWidth="0.6" strokeDasharray="4 3" opacity="0.9" />
      {/* ボール位置 */}
      <circle cx="45" cy="128" r="2" fill="none" stroke="#ffffff" strokeWidth="0.6" opacity="0.9" />
      {/* シャフトプレーン（ボール→肩） */}
      <line x1="45" y1="128" x2="78" y2="58" stroke="#ffd54d" strokeWidth="0.5" opacity="0.85" />
      {/* 前傾（背骨）ライン */}
      <line x1="45" y1="128" x2="38" y2="36" stroke="#ff9d4d" strokeWidth="0.4" opacity="0.6" />
      <text x="6" y="129" fill="#4dd2ff" fontSize="3.6" opacity="0.9">ターゲットライン</text>
      <text x="6" y="18" fill="#ffffff" fontSize="3.6" opacity="0.6">後方（DTL）: 後ろ足つま先の延長線上・腰の高さ</text>
    </svg>
  );
}

/** 正面（フェースオン）: 体の中心線・ボール・腰の高さ */
function GuideFaceOn() {
  return (
    <svg viewBox="0 0 90 160" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      <rect x="18" y="20" width="54" height="118" fill="none" stroke="#ffffff" strokeWidth="0.4" opacity="0.3" strokeDasharray="3 3" />
      {/* 体の中心線 */}
      <line x1="45" y1="20" x2="45" y2="138" stroke="#7CFC66" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.85" />
      {/* 頭の目安 */}
      <circle cx="45" cy="30" r="7" fill="none" stroke="#7CFC66" strokeWidth="0.5" opacity="0.8" />
      {/* 腰の高さ＝カメラの高さの目安 */}
      <line x1="20" y1="80" x2="70" y2="80" stroke="#ffd54d" strokeWidth="0.4" strokeDasharray="2 2" opacity="0.7" />
      <text x="20" y="78" fill="#ffd54d" fontSize="3.4" opacity="0.85">この線にカメラの高さを合わせる（腰）</text>
      {/* 地面・ボール */}
      <line x1="4" y1="132" x2="86" y2="132" stroke="#4dd2ff" strokeWidth="0.6" strokeDasharray="4 3" opacity="0.9" />
      <circle cx="45" cy="128" r="2" fill="none" stroke="#ffffff" strokeWidth="0.6" opacity="0.9" />
      <text x="6" y="18" fill="#ffffff" fontSize="3.6" opacity="0.6">正面（フェースオン）: スタンス中央に正対</text>
    </svg>
  );
}

export function SwingRecorder({ onDone, onClose }: { onDone: (c: Captured) => void; onClose: () => void }) {
  const camRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [limit, setLimit] = useState(8);
  const [angle, setAngle] = useState<Angle>("dtl");
  const [count, setCount] = useState<number | null>(null);
  const [rec, setRec] = useState(false);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Captured | null>(null);
  const [ready, setReady] = useState(false);
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
        /* ---- 撮り終わり ---- */
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <div className="mx-auto flex min-h-0 w-full max-w-[440px] flex-1 items-center">
            <video src={preview.url} controls playsInline autoPlay loop className="max-h-full w-full rounded-lg bg-black" />
          </div>
          <p className="mx-auto mt-2 max-w-[440px] text-xs text-(--color-dim)">
            {preview.phases?._method === "audio"
              ? "✅ 打球音からインパクトを検出し、アドレス〜フィニッシュを自動マークしました"
              : preview.phases
              ? "⚠ 打球音を検出できず、尺から仮の位置を置きました（再生画面で調整できます）"
              : "⚠ フェーズは自動で置けませんでした（再生画面で手動設定できます）"}
          </p>
          <div className="mx-auto mt-3 flex w-full max-w-[440px] gap-2">
            <button onClick={retake} className="btn-ghost">↺ 撮り直す</button>
            <button onClick={() => onDone(preview)} className="btn-gold flex-1">この動画を使う</button>
          </div>
        </div>
      ) : (
        /* ---- 撮影 ---- */
        <div className="flex min-h-0 flex-1 flex-col items-center px-3 pb-3">
          {/* 9:16固定枠 = ガイドと実映像がズレない */}
          <div className="relative mx-auto aspect-[9/16] max-h-full w-full max-w-[440px] shrink overflow-hidden rounded-xl bg-black">
            <video
              ref={camRef}
              muted
              playsInline
              autoPlay
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
            {angle === "dtl" && <GuideDTL />}
            {angle === "faceon" && <GuideFaceOn />}

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

          {/* 設定（下段・シャッターとは別） */}
          <div className="mt-2 flex w-full max-w-[440px] shrink-0 flex-wrap items-center justify-center gap-1.5 text-xs">
            {([["dtl", "後方"], ["faceon", "正面"], ["off", "ガイドなし"]] as [Angle, string][]).map(([a, lab]) => (
              <button
                key={a}
                onClick={() => setAngle(a)}
                className={`rounded-lg border px-2.5 py-1.5 ${angle === a ? "border-(--color-active) text-(--color-active)" : "border-(--color-line) text-(--color-dim)"}`}
              >
                {lab}
              </button>
            ))}
            <span className="mx-1 text-(--color-line)">|</span>
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
