"use client";

import { useEffect, useRef, useState } from "react";
import type { Annotations, Shape } from "@/lib/lesson";
import { PHASES, estimatePhases, hasPhases, type PhaseKey, type Phases } from "@/lib/phases";
import { PhaseBar } from "@/components/phase-bar";
import { analyzePose, drawPose, headSway, poseAt, poseMetrics, videoBox, type PoseData } from "@/lib/pose";
import { loadPose, savePose, saveAnnotations, savePhases } from "./actions";

/**
 * 動画プレーヤー＋描画ツール＋フェーズ移動（PGA NOTE準拠 / DECISIONS #51）
 * - 線 / 円 / フリーハンド、4色、取り消し、全消し
 * - ガイド線プリセット: スイングプレーン / 前傾ライン
 * - コマ送り・スロー再生（0.25x/0.5x/1x）
 * - フェーズ移動: アドレス〜フィニッシュにワンタップ。自動推定＋手動微調整。
 * - 形状は0〜1の正規化座標で保存（annotations JSONB）
 *
 * 2026-08-28: ボーン（骨格）オーバーレイを追加。
 *   撮り終わった動画をブラウザでコマ送り解析し（src/lib/pose.ts）、33関節を動画に重ねる。
 *   結果は lsn_video_pose に残るので、次に開いたときは解析なしですぐ出る。
 *   数値（肩・腰・ねじれ・前傾・頭のブレ）は2D投影なので、
 *   絶対値ではなく「同じ生徒の前回との差」で読むこと。
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

  // --- ボーン（骨格） ---
  const [pose, setPose] = useState<PoseData | null>(null);
  const [poseInfo, setPoseInfo] = useState<{ frames: number; detected: number } | null>(null);
  const [showPose, setShowPose] = useState(true);
  const [poseFps, setPoseFps] = useState<30 | 60>(30);
  const [poseBusy, setPoseBusy] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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

    // 骨格（描画の上に重ねる）
    if (showPose && pose && videoRef.current) {
      const lm = poseAt(pose, videoRef.current.currentTime);
      if (lm) drawPose(ctx, lm, videoBox(videoRef.current, W, H));
    }
  };

  /* 再生中は毎フレーム描き直す。止まっているときは cur が動いたときだけでよい */
  useEffect(() => {
    if (!(showPose && pose && playing)) { redraw(); return; }
    let raf = 0;
    const loop = () => { redraw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPose, pose, playing, shapes, cur]);

  /* 保存済みの骨格を読む（プレーヤーを開いたときだけ・一覧では引かない） */
  useEffect(() => {
    let alive = true;
    loadPose(videoId).then((r) => {
      if (!alive || !r.pose) return;
      setPose(r.pose.data);
      setPoseInfo({ frames: r.pose.frames, detected: r.pose.detected });
    });
    return () => { alive = false; };
  }, [videoId]);

  /** 撮り終わった動画をコマ送りで解析する。中止できる（現場で待たされない） */
  const runPose = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    setPoseBusy({ done: 0, total: 1, phase: "モデルを読み込み中" });
    setMsg(null);
    try {
      const track = await analyzePose(src, {
        fps: poseFps,
        signal: ac.signal,
        onProgress: (done, total, phase) => setPoseBusy({ done, total, phase }),
      });
      setPose(track.data);
      setPoseInfo({ frames: track.frames, detected: track.detected });
      setShowPose(true);
      const r = await savePose(videoId, track);
      setMsg(
        r.error
          ? `解析できましたが保存に失敗しました: ${r.error}`
          : track.detected < track.frames * 0.6
            ? `骨格を解析しました（${track.detected}/${track.frames}コマ）。検出できないコマが多いので、全身が入る画角・明るい場所で撮り直すと精度が上がります`
            : `骨格を解析しました（${track.detected}/${track.frames}コマ）`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解析に失敗しました");
    } finally {
      setPoseBusy(null);
      abortRef.current = null;
    }
  };

  /* いま表示しているコマの数値（2D投影なので前回との差で読む） */
  const nowLm = pose ? poseAt(pose, cur) : null;
  const m = nowLm ? poseMetrics(nowLm) : null;
  const addressLm = pose && typeof phases?.address === "number" ? poseAt(pose, phases.address) : null;
  const sway = m && addressLm ? headSway(poseMetrics(addressLm), m) : null;

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
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
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

      {/* ボーン（骨格）— 2026-08-28 */}
      <div className="mt-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-(--color-gold)">骨格</span>

          {!pose && !poseBusy && canDraw && (
            <>
              <button onClick={runPose} className="btn-ghost !px-2 !py-1.5">🦴 骨格を解析</button>
              <select
                value={poseFps}
                onChange={(e) => setPoseFps(Number(e.target.value) === 60 ? 60 : 30)}
                className="rounded-lg border border-(--color-line) bg-transparent px-2 py-1.5 text-(--color-dim)"
                title="細かく見たいときだけ60。時間は倍かかります"
              >
                <option value={30}>30コマ/秒</option>
                <option value={60}>60コマ/秒</option>
              </select>
              <span className="text-(--color-dim)">初回はモデルの読み込みで少し待ちます</span>
            </>
          )}

          {poseBusy && (
            <>
              <span className="text-(--color-active)">
                {poseBusy.phase} {poseBusy.total > 1 ? `${Math.round((poseBusy.done / poseBusy.total) * 100)}%` : ""}
              </span>
              <button onClick={() => abortRef.current?.abort()} className="btn-ghost !px-2 !py-1.5">中止</button>
            </>
          )}

          {pose && !poseBusy && (
            <>
              <button
                onClick={() => setShowPose((v) => !v)}
                className={`rounded-lg border px-2.5 py-1.5 ${showPose ? "border-(--color-active) text-(--color-active)" : "border-(--color-line) text-(--color-dim)"}`}
              >
                {showPose ? "表示中" : "非表示"}
              </button>
              {poseInfo && (
                <span className="text-(--color-dim)">
                  {poseInfo.detected}/{poseInfo.frames}コマ検出
                </span>
              )}
              {canDraw && <button onClick={runPose} className="btn-ghost !px-2 !py-1.5">↻ 解析し直す</button>}
            </>
          )}
        </div>

        {poseBusy && poseBusy.total > 1 && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-(--color-line)">
            <div
              className="h-full bg-(--color-active) transition-[width]"
              style={{ width: `${Math.round((poseBusy.done / poseBusy.total) * 100)}%` }}
            />
          </div>
        )}

        {/* いま表示しているコマの数値。単眼カメラなので「前回との差」で読む */}
        {pose && showPose && (
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums sm:grid-cols-5">
            {[
              ["肩の傾き", m ? `${m.shoulder > 0 ? "+" : ""}${m.shoulder}°` : "—"],
              ["腰の傾き", m ? `${m.hip > 0 ? "+" : ""}${m.hip}°` : "—"],
              ["ねじれ", m ? `${m.xFactor > 0 ? "+" : ""}${m.xFactor}°` : "—"],
              ["前傾", m ? `${m.spine > 0 ? "+" : ""}${m.spine}°` : "—"],
              ["頭のブレ", sway ? `←→${sway.x > 0 ? "+" : ""}${sway.x}% ↑↓${sway.y > 0 ? "+" : ""}${sway.y}%` : "—"],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between gap-2 sm:block">
                <span className="text-(--color-dim)">{label}</span>
                <span className="sm:block">{val}</span>
              </div>
            ))}
            <p className="col-span-2 text-(--color-dim) sm:col-span-5">
              角度は画面に映った見た目の角度です。カメラ位置が変わると数字も変わるので、
              同じ生徒の前回との差で見てください{sway ? "" : "（頭のブレはアドレスを設定すると出ます）"}
            </p>
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
