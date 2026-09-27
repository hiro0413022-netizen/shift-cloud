"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSegmentUploadUrl, finishSegment, startRecording, endRecording } from "./actions";
import { driveTranscription } from "./types";
import { btnCls, btnGhostCls } from "@/components/ui";

/**
 * 会議の録音（10分ごとに区切った独立ファイルで送る）
 *
 * なぜ区切るか:
 *   - 1本の長い録音だと、止めてから送る・文字起こしする待ちが会議の長さに比例して伸びる。
 *     10分ごとに送って録音中から文字起こしを進めれば、止めた時点でほぼ終わっている。
 *   - ブラウザが落ちても、失うのは最大で今の10分だけ。
 *   - 区切るたびに MediaRecorder を作り直すので、各区間が単体で再生できる音声になる
 *     （lesson-os の「5秒の断片」は先頭にしかヘッダが無く、単体では読めなかった）。
 *
 * 区切りの継ぎ目で言葉が欠けないよう、新しい区間を先に始めてから1秒後に前の区間を止める（1秒重ねる）。
 */

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

type Seg = { mr: MediaRecorder; idx: number; offset: number; startedAt: number; chunks: Blob[]; onDone?: () => void };
type Pending = { blob: Blob; idx: number; offset: number; seconds: number; mime: string };

export function Recorder({
  meetingId,
  segmentSeconds,
  firstIdx,
  onFinished,
}: {
  meetingId: string;
  segmentSeconds: number;
  firstIdx: number;
  onFinished: (msg: string | null) => void;
}) {
  const [rec, setRec] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [sec, setSec] = useState(0);
  const [sent, setSent] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<Pending[]>([]);

  const stream = useRef<MediaStream | null>(null);
  const cur = useRef<Seg | null>(null);
  const t0 = useRef(0);
  const nextIdx = useRef(firstIdx);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const mimeRef = useRef("");
  const driving = useRef(false);
  /** 送れなかった区間（state は古い値を掴むので、判定はこちらで行う） */
  const failedRef = useRef<Pending[]>([]);

  const keepAwake = useCallback(async () => {
    try {
      wake.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      /* 取れなくても録音は続く */
    }
  }, []);

  useEffect(() => {
    if (!rec) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void keepAwake();
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [rec, keepAwake]);

  /** 録音中から文字起こしを進める（多重に走らせない） */
  const kick = useCallback(() => {
    if (driving.current) return;
    driving.current = true;
    void driveTranscription(meetingId, () => {}).finally(() => {
      driving.current = false;
    });
  }, [meetingId]);

  const uploadOne = useCallback(
    async (p: Pending): Promise<boolean> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const up = await createSegmentUploadUrl(meetingId, p.idx, p.mime);
          if (!up.url || !up.path) throw new Error(up.error ?? "URLを発行できませんでした");
          const res = await fetch(up.url, { method: "PUT", headers: { "Content-Type": p.mime }, body: p.blob });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const fin = await finishSegment(meetingId, {
            idx: p.idx,
            path: up.path,
            bytes: p.blob.size,
            seconds: p.seconds,
            offsetSeconds: p.offset,
            mime: p.mime,
          });
          if (fin.error) throw new Error(fin.error);
          setSent((n) => n + 1);
          kick();
          return true;
        } catch {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
      return false;
    },
    [meetingId, kick]
  );

  const enqueue = useCallback(
    (p: Pending) => {
      chain.current = chain.current.then(async () => {
        const ok = await uploadOne(p);
        if (!ok) {
          // 音声はこの画面のメモリに残っている。再送ボタンで送り直せる
          failedRef.current = [...failedRef.current, p];
          setFailed(failedRef.current);
        }
      });
    },
    [uploadOne]
  );

  const startSegment = useCallback(
    (offset: number): Seg => {
      const s = stream.current!;
      const mime = mimeRef.current;
      const mr = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const seg: Seg = { mr, idx: nextIdx.current, offset, startedAt: Date.now(), chunks: [] };
      nextIdx.current += 1;
      mr.ondataavailable = (e) => {
        if (e.data.size) seg.chunks.push(e.data);
      };
      mr.onstop = () => {
        const type = (mr.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(seg.chunks, { type });
        seg.chunks = [];
        if (blob.size) enqueue({ blob, idx: seg.idx, offset: seg.offset, seconds: (Date.now() - seg.startedAt) / 1000, mime: type });
        seg.onDone?.();
      };
      mr.start(10000); // 10秒ごとに手元へ溜める（止めたときに最後まで取り出せるように）
      return seg;
    },
    [enqueue]
  );

  const start = async () => {
    setMsg(null);
    const r = await startRecording(meetingId);
    if (r.error) {
      setMsg(r.error);
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch {
      setMsg("マイクを使えませんでした。ブラウザのマイク許可を確認してください");
      return;
    }
    mimeRef.current = MIMES.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
    t0.current = Date.now();
    cur.current = startSegment(0);
    setRec(true);
    setSec(0);
    void keepAwake();
    tick.current = setInterval(() => {
      const elapsed = (Date.now() - t0.current) / 1000;
      setSec(Math.floor(elapsed));
      const c = cur.current;
      if (c && elapsed - c.offset >= segmentSeconds) {
        // 新しい区間を先に始めてから、1秒後に前を止める（継ぎ目で言葉を落とさない）
        cur.current = startSegment(elapsed);
        setTimeout(() => {
          try {
            c.mr.stop();
          } catch {
            /* すでに止まっている */
          }
        }, 1000);
      }
    }, 1000);
  };

  const stop = async () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    setRec(false);
    setStopped(true);
    setBusy("残りの音声を送っています…");
    const last = cur.current;
    cur.current = null;
    if (last) {
      await new Promise<void>((res) => {
        last.onDone = res;
        try {
          last.mr.stop();
        } catch {
          res();
        }
      });
    }
    // 区切りで止めかけていた前の区間の onstop も待つ
    await new Promise((r) => setTimeout(r, 1200));
    await chain.current;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    wake.current?.release().catch(() => {});
    wake.current = null;
    setBusy(null);
  };

  const finish = async () => {
    await stop();
    if (failedRef.current.length) {
      setMsg("送れなかった区間があります。「再送」を押してから進めてください");
      return;
    }
    const r = await endRecording(meetingId);
    onFinished(r.error ?? null);
  };

  const resend = async () => {
    const list = failedRef.current;
    failedRef.current = [];
    setFailed([]);
    setBusy("送り直しています…");
    const still: Pending[] = [];
    for (const p of list) if (!(await uploadOne(p))) still.push(p);
    failedRef.current = still;
    setFailed(still);
    setBusy(null);
    if (still.length) setMsg("まだ送れていません。電波の良い場所で再送してください");
  };

  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {stopped && !rec ? (
          <button onClick={finish} disabled={Boolean(busy)} className={`${btnCls} px-6 py-3 text-base`}>
            議事録へ進む
          </button>
        ) : !rec ? (
          <button onClick={start} disabled={Boolean(busy)} className={`${btnCls} px-6 py-3 text-base`}>
            ● 録音を開始
          </button>
        ) : (
          <button onClick={finish} className="inline-flex items-center gap-2 rounded-lg bg-(--color-danger) px-6 py-3 text-base font-medium text-white">
            ■ 録音を終えて議事録へ
          </button>
        )}
        <span className="font-mono text-3xl tabular-nums">
          {mm}:{ss}
        </span>
        {rec && <span className="inline-flex items-center gap-1 text-sm text-red-600"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />録音中</span>}
      </div>
      <p className="text-sm text-(--color-dim)">
        {Math.round(segmentSeconds / 60)}分ごとに区切って送り、録音しながら文字起こしを進めます。送信済み: {sent}区間
      </p>
      {rec && (
        <p className="text-xs text-(--color-dim)">
          この画面を開いたままにしてください（画面ロックを避けるため自動でスリープを止めています）。
        </p>
      )}
      {failed.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          送れなかった区間が {failed.length} 件あります（この画面に残っています）。
          <button onClick={resend} disabled={Boolean(busy)} className={btnGhostCls}>
            再送
          </button>
        </div>
      )}
      {busy && <p className="text-sm text-(--color-accent)">{busy}</p>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
