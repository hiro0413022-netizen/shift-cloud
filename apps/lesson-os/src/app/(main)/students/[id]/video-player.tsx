"use client";

import { useEffect, useRef, useState } from "react";
import type { Annotations, Shape } from "@/lib/lesson";
import { PHASES, estimatePhases, hasPhases, type PhaseKey, type Phases } from "@/lib/phases";
import { PhaseBar } from "@/components/phase-bar";
import { saveAnnotations, savePhases } from "./actions";

/**
 * 動画プレーヤー＋描画ツール＋フェーズ移動（PGA NOTE準拠 / DECISIONS #51）
 * - 線 / 円 / フリーハンド、4色、取り消し、全消し
 * - ガイド線プリセット: スイングプレーン / 前傾ライン
 * - コマ送り・スロー再生（0.25x/0.5x/1x）
 * - フェーズ移動: アドレス〜フィニッシュにワンタップ。自動推定＋手動微調整。
 * - 形状は0〜1の正規化座標で保存（annotations JSONB）
 */
type Tool = "none" | "line" | "circle" | "free";
const COLORS = ["#ff4d4d", "#ffd54d", "#7CFC66", "#4dd2ff"];

export function VideoPlayer({
  videoId,
  src,
  initial,
  initialPhases,
  canDraw = true,
}: {
  videoId: string;
  src: string;
  initial?: Annotations | null;
  initialPhases?: Phases | null;
  canDraw?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [shapes, setShapes] = useState<Shape[]>(initial?.shapes ?? []);
  const [tool, setTool] = useState<Tool>("none");
  const [color, setColor] = useState(COLORS[0]);
  const [rate, setRate] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const drawing = useRef<{ sx: number; sy: number; pts: [number, number][] } | null>(null);

  // --- フェーズ ---
  const [phases, setPhases] = useState<Phases | null>(initialPhases ?? null);
  const [phaseEdit, setPhaseEdit] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [estimating, setEstimating] = useState(false);

  const jump = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
    setCur(t);
  };
  const setPhaseHere = (k: PhaseKey) => {
    const v = videoRef.current;
    if (!v) return;
    setPhases((p) => ({ ...(p ?? {}), [k]: Number(v.currentTime.toFixed(3)), _method: "manual" }));
  };
  const cyclePhase = (dir: 1 | -1) => {
    const list = PHASES.map((p) => phases?.[p.key]).filter((t): t is number => typeof t === "number").sort((a, b) => a - b);
    if (!list.length) return;
    const next = dir === 1 ? list.find((t) => t > cur + 0.02) : [...list].reverse().find((t) => t < cur - 0.02);
    jump(next ?? (dir === 1 ? list[0] : list[list.length - 1]));
  };
  const autoEstimate = async () => {
    setEstimating(true);
    const p = await estimatePhases(src, videoRef.current?.duration);
    setEstimating(false);
    if (!p) { setMsg("自動推定できませんでした。手動で設定してください"); return; }
    setPhases(p);
    setPhaseEdit(true);
    setMsg(p._method === "audio" ? "打球音からインパクトを検出しました。ズレていれば直してください" : "尺から仮置きしました。位置を直してください");
  };
  const commitPhases = async () => {
    const r = await savePhases(videoId, phases ?? {}, dur || undefined);
    setPhaseEdit(false);
    setMsg(r.error ?? "フェーズを保存しました");
  };

  // 描画
  const redraw = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const W = cv.width;
    const H = cv.height;
    for (const s of shapes) {
      ctx.strokeStyle = s.c;
      ctx.lineWidth = Math.max(2, W / 300);
      ctx.beginPath();
      if (s.t === "line") {
        ctx.moveTo(s.x1 * W, s.y1 * H);
        ctx.lineTo(s.x2 * W, s.y2 * H);
      } else if (s.t === "circle") {
        ctx.arc(s.cx * W, s.cy * H, s.r * W, 0, Math.PI * 2);
      } else {
        s.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * W, y * H) : ctx.lineTo(x * W, y * H)));
      }
      ctx.stroke();
    }
  };

  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const resize = () => {
      cv.width = wrap.clientWidth;
      cv.height = wrap.clientHeight;
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(redraw, [shapes]); // eslint-disable-line react-hooks/exhaustive-deps

  const norm = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const onDown = (e: React.PointerEvent) => {
    if (tool === "none" || !canDraw) return;
    e.preventDefault();
    const [x, y] = norm(e);
    drawing.current = { sx: x, sy: y, pts: [[x, y]] };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current || tool === "none") return;
    const [x, y] = norm(e);
    const d = drawing.current;
    if (tool === "free") {
      d.pts.push([x, y]);
      // フリーハンドはライブ描画: 最後の形状を更新
      setShapes((prev) => {
        const base = drawingLive.current ? prev.slice(0, -1) : prev;
        drawingLive.current = true;
        return [...base, { t: "free", pts: [...d.pts], c: color }];
      });
    } else {
      setShapes((prev) => {
        const base = drawingLive.current ? prev.slice(0, -1) : prev;
        drawingLive.current = true;
        return [
          ...base,
          tool === "line"
            ? { t: "line", x1: d.sx, y1: d.sy, x2: x, y2: y, c: color }
            : { t: "circle", cx: d.sx, cy: d.sy, r: Math.hypot(x - d.sx, y - d.sy), c: color },
        ];
      });
    }
  };
  const drawingLive = useRef(false);
  const onUp = () => {
    drawing.current = null;
    drawingLive.current = false;
  };

  // ガイド線プリセット
  const addGuide = (kind: "plane" | "posture") => {
    if (kind === "plane") {
      setShapes((p) => [
        ...p,
        { t: "line", x1: 0.18, y1: 0.92, x2: 0.85, y2: 0.25, c: "#ffd54d" },
        { t: "line", x1: 0.3, y1: 0.95, x2: 0.9, y2: 0.35, c: "#4dd2ff" },
      ]);
    } else {
      setShapes((p) => [
        ...p,
        { t: "line", x1: 0.5, y1: 0.1, x2: 0.5, y2: 0.95, c: "#7CFC66" },
        { t: "line", x1: 0.62, y1: 0.15, x2: 0.5, y2: 0.95, c: "#ffd54d" },
      ]);
    }
  };

  const step = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + sec);
  };
  const setSpeed = (r: number) => {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };

  return (
    <div>
      <div ref={wrapRef} className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
          onSeeked={(e) => setCur(e.currentTarget.currentTime)}
          className="max-h-[68vh] w-full"
        />
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="absolute inset-0"
          style={{ pointerEvents: tool === "none" ? "none" : "auto", touchAction: tool === "none" ? "auto" : "none" }}
        />
      </div>

      {/* フェーズ移動（アドレス〜フィニッシュ） */}
      <div className="mt-3 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-2.5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-(--color-gold)">
            {phaseEdit ? "位置を調整中: 動画を止めてフェーズを押す" : "フェーズ移動"}
          </span>
          <button onClick={() => cyclePhase(-1)} className="btn-ghost !px-2 !py-1" title="前のフェーズ">◀</button>
          <button onClick={() => cyclePhase(1)} className="btn-ghost !px-2 !py-1" title="次のフェーズ">▶</button>
          <span className="ml-auto tabular-nums text-(--color-dim)">
            {cur.toFixed(2)} / {dur ? dur.toFixed(2) : "-"}s
          </span>
        </div>
        <PhaseBar
          phases={phases}
          duration={dur}
          current={cur}
          onJump={jump}
          edit={phaseEdit && canDraw}
          onSet={setPhaseHere}
        />
        {canDraw && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <button onClick={() => setPhaseEdit((e) => !e)} className="btn-ghost !px-2 !py-1.5">
              {phaseEdit ? "調整をやめる" : hasPhases(phases) ? "✎ 位置を調整" : "✎ 位置を設定"}
            </button>
            <button onClick={autoEstimate} disabled={estimating} className="btn-ghost !px-2 !py-1.5">
              {estimating ? "推定中…" : "⚡ 自動推定"}
            </button>
            {phaseEdit && (
              <>
                <button onClick={() => setPhases(null)} className="btn-ghost !px-2 !py-1.5">全解除</button>
                <button onClick={commitPhases} className="btn-gold !px-3 !py-1.5">フェーズを保存</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 再生コントロール */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <button onClick={() => step(-1 / 30)} className="btn-ghost !px-2 !py-1.5" title="1コマ戻す">⏴¹</button>
        <button onClick={() => step(1 / 30)} className="btn-ghost !px-2 !py-1.5" title="1コマ送る">¹⏵</button>
        {[0.25, 0.5, 1].map((r) => (
          <button
            key={r}
            onClick={() => setSpeed(r)}
            className={`rounded-lg border px-2 py-1.5 ${rate === r ? "border-(--color-gold) text-(--color-gold)" : "border-(--color-line) text-(--color-dim)"}`}
          >
            {r}x
          </button>
        ))}
      </div>

      {canDraw && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {([["none", "✋ 操作"], ["line", "／ 直線"], ["circle", "○ 円"], ["free", "〜 フリー"]] as [Tool, string][]).map(([t, lab]) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className={`rounded-lg border px-2.5 py-1.5 ${tool === t ? "border-(--color-active) text-(--color-active)" : "border-(--color-line) text-(--color-dim)"}`}
            >
              {lab}
            </button>
          ))}
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
              style={{ background: c }}
              aria-label={`色 ${c}`}
            />
          ))}
          <span className="mx-1 text-(--color-line)">|</span>
          <button onClick={() => addGuide("plane")} className="btn-ghost !px-2 !py-1.5">スイングプレーン</button>
          <button onClick={() => addGuide("posture")} className="btn-ghost !px-2 !py-1.5">前傾ガイド</button>
          <span className="mx-1 text-(--color-line)">|</span>
          <button onClick={() => setShapes((p) => p.slice(0, -1))} className="btn-ghost !px-2 !py-1.5">↩ 取り消し</button>
          <button onClick={() => setShapes([])} className="btn-ghost !px-2 !py-1.5">全消し</button>
          <button
            onClick={async () => {
              const r = await saveAnnotations(videoId, { shapes });
              setMsg(r.error ?? "描画を保存しました");
            }}
            className="btn-gold !px-3 !py-1.5"
          >
            描画を保存
          </button>
          {msg && <span className="text-(--color-dim)">{msg}</span>}
        </div>
      )}
    </div>
  );
}
