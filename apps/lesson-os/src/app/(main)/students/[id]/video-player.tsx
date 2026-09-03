"use client";

import { useEffect, useRef, useState } from "react";
import type { Annotations, Shape } from "@/lib/lesson";
import { PHASES, estimatePhases, hasPhases, type PhaseKey, type Phases } from "@/lib/phases";
import { PhaseBar } from "@/components/phase-bar";
import {
  analyzeSwing, clubAt, drawClubArc, drawClubTrace, drawPlane, drawPose, headSway,
  planeMetrics, poseAt, poseMetrics, videoBox, viewPoint,
  type ClubData, type ClubDiag, type Plane, type PoseData,
} from "@/lib/pose";
import { loadPose, savePlane, savePose, saveAnnotations, savePhases } from "./actions";

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
 *
 * 2026-08-28(2): クラブヘッド軌跡とスイングプレーンを追加。
 *   骨格と同じ1回の解析でまとめて作る（動画を2回なめない）。
 *   軌跡は確からしさで濃さが変わる＝**インパクト前後で線が飛ぶのは正常**。
 *   60fpsではヘッドが1コマ60〜80cm動いて帯状にブレるので、そこは追えない。
 *   自動プレーンが外れたときは、線ツールで引いた直線を基準面に採用できる（手動が優先）。
 *
 * 2026-08-29: 軌跡の「1本の線」表示（アーク）を追加。
 *   市販アプリのようにスイング全体をなめらかな弧で見せる（src/lib/pose.ts の buildClubArc）。
 *   フェーズがあればアドレス〜フィニッシュに絞る。実測が無い区間（インパクト前後）は
 *   破線＝計測できていないことを隠さない。従来の「再生に合わせた尾」表示と切り替え。
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

  // --- スイング解析（骨格・クラブ軌跡・プレーン） ---
  const [pose, setPose] = useState<PoseData | null>(null);
  const [club, setClub] = useState<ClubData | null>(null);
  const [plane, setPlane] = useState<Plane | null>(null);
  const [poseInfo, setPoseInfo] = useState<{ frames: number; detected: number; srcFps: number | null } | null>(null);
  /** クラブが取れなかったときに「どこで落ちたか」を出す。原因を推測でなく数字で言えるようにする */
  const [diag, setDiag] = useState<ClubDiag | null>(null);
  const [showPose, setShowPose] = useState(true);
  const [showTrace, setShowTrace] = useState(true);
  /** 軌跡の見せ方: tail=再生に合わせて尾を引く / arc=スイング全体を1本の線で */
  const [traceStyle, setTraceStyle] = useState<"tail" | "arc">("tail");
  const [showPlane, setShowPlane] = useState(true);
  const [poseFps, setPoseFps] = useState<30 | 60 | 120>(30);
  const [poseBusy, setPoseBusy] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  /** 角度計算は必ず動画の実寸(px)で行う。正規化のままだと 9:16 で角度が狂う */
  const [dim, setDim] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
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

    // 解析結果（描画の上に重ねる）
    if (videoRef.current && (pose || club || plane)) {
      const box = videoBox(videoRef.current, W, H);
      const now = videoRef.current.currentTime;
      if (showPlane && plane) drawPlane(ctx, plane, box);
      if (showTrace && club) {
        if (traceStyle === "arc") {
          // アーク＝スイング全体を1本の線で。フェーズがあれば素振りやフィニッシュ後を弧に入れない
          drawClubArc(ctx, club, box, {
            fromSec: typeof phases?.address === "number" ? phases.address - 0.3 : undefined,
            toSec: typeof phases?.finish === "number" ? phases.finish + 0.3 : undefined,
            pose,
          });
          drawClubTrace(ctx, club, box, now, { tailMs: 0 }); // いまのコマのヘッド位置だけ重ねる
        } else {
          drawClubTrace(ctx, club, box, now);
        }
      }
      if (showPose && pose) {
        const lm = poseAt(pose, now);
        if (lm) drawPose(ctx, lm, box);
      }
    }
  };

  /* 再生中は毎フレーム描き直す。止まっているときは cur が動いたときだけでよい */
  useEffect(() => {
    if (!((pose || club || plane) && playing)) { redraw(); return; }
    let raf = 0;
    const loop = () => { redraw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPose, showTrace, traceStyle, showPlane, pose, club, plane, playing, shapes, cur, phases]);

  /* 保存済みの解析結果を読む（プレーヤーを開いたときだけ・一覧では引かない） */
  useEffect(() => {
    let alive = true;
    loadPose(videoId).then((r) => {
      if (!alive || !r.pose) return;
      setPose(r.pose.data);
      setClub(r.pose.club);
      setPlane(r.pose.plane);
      setDiag(r.pose.diag);
      setPoseInfo({ frames: r.pose.frames, detected: r.pose.detected, srcFps: r.pose.srcFps });
    });
    return () => { alive = false; };
  }, [videoId]);

  /** 撮り終わった動画をコマ送りで解析する。骨格・クラブ軌跡・プレーンを1回でまとめて作る */
  const runAnalyze = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    setPoseBusy({ done: 0, total: 1, phase: "モデルを読み込み中" });
    setMsg(null);
    try {
      const track = await analyzeSwing(src, {
        fps: poseFps,
        signal: ac.signal,
        onProgress: (done, total, phase) => setPoseBusy({ done, total, phase }),
      });
      setPose(track.data);
      setClub(track.club);
      setDiag(track.diag);
      // 手で引いたプレーンは解析し直しても残す（コーチの判断のほうが正しい）
      const keepManual = plane?._method === "manual" ? plane : null;
      const nextPlane = keepManual ?? track.plane;
      setPlane(nextPlane);
      setPoseInfo({ frames: track.frames, detected: track.detected, srcFps: track.srcFps });
      setShowPose(true);

      const r = await savePose(videoId, { ...track, plane: nextPlane });
      const notes: string[] = [`骨格 ${track.detected}/${track.frames}コマ`];
      notes.push(track.club ? "クラブ軌跡あり" : "クラブ軌跡は取れませんでした");
      if (track.detected < track.frames * 0.6) notes.push("全身が入る画角・明るい場所で撮り直すと精度が上がります");
      if (!track.club) notes.push("手元とクラブが画面に入っているか確認してください");
      setMsg(r.error ? `解析できましたが保存に失敗しました: ${r.error}` : notes.join(" / "));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解析に失敗しました");
    } finally {
      setPoseBusy(null);
      abortRef.current = null;
    }
  };

  /** 描いた直線をスイングプレーンの基準にする（自動が外れたときの逃げ道） */
  const lastLine = [...shapes].reverse().find((sh): sh is Extract<Shape, { t: "line" }> => sh.t === "line");
  const useLineAsPlane = async () => {
    if (!lastLine) return;
    // 画面外まで伸ばしておく（プレーンは線分ではなく面のつもりで見るもの）
    const dx = lastLine.x2 - lastLine.x1;
    const dy = lastLine.y2 - lastLine.y1;
    const len = Math.hypot(dx, dy) || 1;
    const k = 2 / len;
    const next: Plane = {
      x1: Number((lastLine.x1 - dx * k).toFixed(4)),
      y1: Number((lastLine.y1 - dy * k).toFixed(4)),
      x2: Number((lastLine.x2 + dx * k).toFixed(4)),
      y2: Number((lastLine.y2 + dy * k).toFixed(4)),
      _method: "manual",
    };
    setPlane(next);
    setShowPlane(true);
    const r = await savePlane(videoId, next);
    setMsg(r.error ?? "この線をスイングプレーンにしました");
  };
  const resetPlane = async () => {
    setPlane(null);
    const r = await savePlane(videoId, null);
    setMsg(r.error ?? "プレーンを消しました。解析し直すと自動で引き直します");
  };

  /* いま表示しているコマの数値（2D投影なので前回との差で読む） */
  const dw = dim.w || 1;
  const dh = dim.h || 1;
  const nowLm = pose ? poseAt(pose, cur) : null;
  const m = nowLm ? poseMetrics(nowLm, dw, dh) : null;
  const addressLm = pose && typeof phases?.address === "number" ? poseAt(pose, phases.address) : null;
  const sway = m && addressLm ? headSway(poseMetrics(addressLm, dw, dh), m) : null;
  const pm = plane && club ? planeMetrics(plane, club, dw, dh, phases ?? null) : null;
  // 撮影の再現性を見るための目安（三脚を据えない運用のため・2026-08-28）
  const firstLm = pose ? poseAt(pose, pose.t.length ? pose.t[Math.floor(pose.t.length * 0.1)] / 1000 : 0) : null;
  const vp = (addressLm ?? firstLm) ? viewPoint((addressLm ?? firstLm)!, dw, dh) : null;
  const headNow = clubAt(club, cur);
  // 実測（画像から取れた）と推定（前腕から補った）は必ず分けて数える
  const clubCount = club
    ? club.p.reduce(
        (a, r) => (r.length === 3 ? (r[2] > 0 ? { real: a.real + 1, est: a.est } : { real: a.real, est: a.est + 1 }) : a),
        { real: 0, est: 0 }
      )
    : null;

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
          onLoadedMetadata={(e) => {
            setDur(e.currentTarget.duration || 0);
            setDim({ w: e.currentTarget.videoWidth || 0, h: e.currentTarget.videoHeight || 0 });
          }}
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

      {/* スイング解析（骨格・クラブ軌跡・プレーン）— 2026-08-28 */}
      <div className="mt-2 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-(--color-gold)">スイング解析</span>

          {!pose && !poseBusy && canDraw && (
            <>
              <button onClick={runAnalyze} className="btn-ghost !px-2 !py-1.5">🦴 解析する</button>
              <select
                value={poseFps}
                onChange={(e) => setPoseFps(Number(e.target.value) === 120 ? 120 : Number(e.target.value) === 60 ? 60 : 30)}
                className="rounded-lg border border-(--color-line) bg-transparent px-2 py-1.5 text-(--color-dim)"
                title="クラブ軌跡を細かく見たいときだけ上げる。時間も比例して伸びます"
              >
                <option value={30}>30コマ/秒</option>
                <option value={60}>60コマ/秒</option>
                <option value={120}>120コマ/秒（スロー撮影用）</option>
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
              {([
                ["骨格", showPose, setShowPose, true],
                ["クラブ軌跡", showTrace, setShowTrace, !!club],
                ["🌀 1本の線", traceStyle === "arc", (v: boolean) => setTraceStyle(v ? "arc" : "tail"), !!club && showTrace],
                ["プレーン", showPlane, setShowPlane, !!plane],
              ] as [string, boolean, (v: boolean) => void, boolean][]).map(([label, on, set, has]) => (
                <button
                  key={label}
                  disabled={!has}
                  onClick={() => set(!on)}
                  className={`rounded-lg border px-2.5 py-1.5 disabled:opacity-30 ${on && has ? "border-(--color-active) text-(--color-active)" : "border-(--color-line) text-(--color-dim)"}`}
                >
                  {label}
                </button>
              ))}
              {poseInfo && (
                <span className="text-(--color-dim)">
                  {poseInfo.detected}/{poseInfo.frames}コマ検出
                  {poseInfo.srcFps ? ` ・元動画 ${poseInfo.srcFps}fps` : ""}
                </span>
              )}
              {/* 2026-09-03: 骨格をどれだけ直したか。「きれいに出た」のか「直した結果きれいに見えている」のかは
                  コーチが数字を読むときに知っておくべき差なので、黙って直さず件数を出す */}
              {diag?.pose && diag.pose.lowVis + diag.pose.stretched + diag.pose.spikes + diag.pose.swapped > 0 && (
                <span
                  className="rounded bg-(--color-header)/40 px-2 py-0.5 text-(--color-dim)"
                  title={`信頼度が低い ${diag.pose.lowVis} ／ 骨が伸びた ${diag.pose.stretched} ／ 行って戻る飛び ${diag.pose.spikes} ／ 埋められず残した ${diag.pose.left}`}
                >
                  🔧 骨格を直した点 {diag.pose.lowVis + diag.pose.stretched + diag.pose.spikes}
                  {diag.pose.swapped > 0 ? ` ・左右の入れ替わり ${diag.pose.swapped}コマ` : ""}
                </span>
              )}
              {diag?.pose && diag.pose.asym >= 40 && (
                <span
                  className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-300"
                  title="3次元では左右の骨は同じ長さです。画面上でここまで違うのは、片側が体に隠れて取れていないとき。角度の数字は当てにしないでください"
                >
                  ⚠ 左右の骨の長さが {diag.pose.asym}% 違います
                </span>
              )}
              {vp && (
                <span className="rounded bg-(--color-header)/40 px-2 py-0.5 text-(--color-dim)" title="前回と近い数字なら、角度も前回と比べられます">
                  📷 {vp.label}{vp.deg}° ・体の大きさ {vp.fill}%
                </span>
              )}
              {canDraw && <button onClick={runAnalyze} className="btn-ghost !px-2 !py-1.5">↻ 解析し直す</button>}
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

        {/* 体の数値（いま表示しているコマ） */}
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
          </div>
        )}

        {/* スイングプレーン */}
        {pose && !poseBusy && (
          <div className="mt-2 border-t border-(--color-line) pt-2">
            {pm ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums sm:grid-cols-5">
                {[
                  ["プレーン角", `${pm.angle}°`],
                  ["トップ", pm.top == null ? "—" : `${pm.top > 0 ? "+" : ""}${pm.top}%`],
                  ["切り返し", pm.down == null ? "—" : `${pm.down > 0 ? "+" : ""}${pm.down}%`],
                  ["バック最大", pm.backMax == null ? "—" : `${pm.backMax > 0 ? "+" : ""}${pm.backMax}%`],
                  ["ダウン最大", pm.downMax == null ? "—" : `${pm.downMax > 0 ? "+" : ""}${pm.downMax}%`],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-2 sm:block">
                    <span className="text-(--color-dim)">{label}</span>
                    <span className="sm:block">{val}</span>
                  </div>
                ))}
                <p className="col-span-2 text-(--color-dim) sm:col-span-5">
                  ％はクラブ長を100としたプレーンからの離れ。
                  <span className="text-(--color-txt)">＋がプレーンより上（スティープ側）・−が下（シャロー側）</span>。
                  {plane?._method === "manual" ? "（手で引いた線が基準）" : "（アドレスのシャフト線が基準）"}
                </p>
              </div>
            ) : club ? (
              <p className="text-xs text-(--color-dim)">
                プレーンがありません。線ツールで基準にしたい直線を引いて【この線をプレーンにする】を押してください
              </p>
            ) : (
              <div className="text-xs text-(--color-dim)">
                <p>クラブ軌跡が取れていないため、プレーンは出せません。</p>
                {diag && (
                  <>
                    <p className="mt-1 tabular-nums">
                      解析{diag.frames}コマ → 手元が取れた{diag.withPose} → 向きの候補{diag.withRay} → 線として残った{diag.kept}
                      （動きの閾値 {diag.thr} ／ 線の詰まり {diag.fill}% ／ 確からしさ {diag.conf}% ／ 比較コマ間隔 {diag.gap}）
                    </p>
                    {/* #185: 線は出たが「クラブではなかった」場合は、その判定結果を優先して出す。
                        撮り方の一般論より、実際に何が起きたかのほうが直しようがある。 */}
                    {diag.verdict?.reason ? (
                      <>
                        <p className="mt-1 text-amber-300">{diag.verdict.reason}</p>
                        {diag.verdict.advice && <p className="mt-1">{diag.verdict.advice}</p>}
                        <p className="mt-1 tabular-nums text-[11px]">
                          （実測での確認: ヘッドが手元より下 {diag.verdict.belowHands}コマ ／
                          縦の動き 体の{diag.verdict.vRangePct}% ／
                          向きの振れ {diag.verdict.sweepDeg}度 ／
                          手元の最大速度 体の{diag.verdict.handSpeedPct}%/コマ）
                        </p>
                      </>
                    ) : (
                      <p className="mt-1">
                        {diag.withPose < diag.frames * 0.5
                          ? "手元（両手首）がほとんど取れていません。全身が画面に入る画角で撮り直してください。"
                          : diag.withRay < diag.withPose * 0.3
                            ? "クラブの動きが画面から見つかりません。手元からヘッドまでが画面に入っているか、背景とクラブの色が近すぎないかを確認してください。"
                            : "クラブらしい直線が続きません。背景がごちゃついている／逆光／手ブレが原因のことが多いです。スマホを固定して撮り直すと変わります。"}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {canDraw && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <button onClick={useLineAsPlane} disabled={!lastLine} className="btn-ghost !px-2 !py-1.5 disabled:opacity-40">
                  ✎ この線をプレーンにする
                </button>
                {plane && <button onClick={resetPlane} className="btn-ghost !px-2 !py-1.5">プレーンを消す</button>}
                {headNow && headNow.conf < 0.35 && (
                  <span className="text-(--color-dim)">このコマはヘッドがブレていて自信が低いです</span>
                )}
              </div>
            )}
          </div>
        )}

        {pose && (
          <p className="mt-2 text-xs text-(--color-dim)">
            <span className="text-(--color-txt)">頭のブレ・プレーンからの離れ（%）は体の大きさで割ってあるので、撮影距離が変わっても比べられます。</span>
            {" "}一方で角度は「画面に映った見た目の角度」なので、立ち位置が変わると数字も変わります。
            上の「📷 {vp ? `${vp.label}${vp.deg}° ・体の大きさ ${vp.fill}%` : "撮影方向"}」が前回と近ければ、角度もそのまま比べられます。
            撮影画面の【👻 前回に重ねる】を使うと合わせやすくなります。
            {clubCount &&
              ` クラブ軌跡は実測${clubCount.real}コマ・前腕から推定${clubCount.est}コマ（推定は青い点線）。` +
              (traceStyle === "arc" ? "【1本の線】は実測をなめらかにまとめた弧。青い破線＝骨格（前腕とコック）から補った推定区間。" : "")}
            {poseInfo?.srcFps && poseInfo.srcFps < 50 && "この動画は" + poseInfo.srcFps + "fpsです。インパクト前後まで見たいならiPhone純正カメラのスローモーションで撮ってください。"}
          </p>
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
