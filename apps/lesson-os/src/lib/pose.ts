/**
 * ボーン（骨格）解析 — ブラウザ専用（2026-08-28）
 *
 * 何をするか:
 *   撮影済みのスイング動画を1コマずつ MediaPipe Pose Landmarker に通し、
 *   33関節の座標を取り出す。結果は動画に重ねて描く / 角度を出す / DBに残す。
 *
 * なぜ「撮影中」ではなく「撮り終わってから」か:
 *   リアルタイム解析はスマホだと 15〜25fps まで落ちてコマを取りこぼす。
 *   撮り終わった動画をコマ送りで流し込めば、時間はかかるが全コマ解析できる。
 *   スイングは 0.25 秒で終わる動きなので、コマの取りこぼしは致命傷になる。
 *
 * 単眼カメラの限界（数字の読み方）:
 *   z（奥行き）は推定値。角度計算は基本 x,y の2Dだけで行い、z は将来用に持つだけ。
 *   2Dの角度はカメラ位置で変わるので、「同じ人の前回との差」で見るのが正しい使い方。
 *
 * モデルとwasmの置き場所:
 *   まず自前ホスト（/mp/…）を見に行き、無ければCDNに落ちる。
 *   自前ホストぶんは scripts/prepare-mediapipe.mjs が build 前に用意する（リポジトリには入れない）。
 */

import type { PoseLandmarker } from "@mediapipe/tasks-vision";

const PKG_VERSION = "1.0.1";
const MODEL_FILE = "pose_landmarker_lite.task";

const LOCAL_WASM = "/mp/wasm";
const LOCAL_MODEL = `/mp/${MODEL_FILE}`;
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${PKG_VERSION}/wasm`;
const CDN_MODEL = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/${MODEL_FILE}`;

/** 解析にかける最大コマ数（30fpsで約33秒ぶん）。長い動画で端末が固まらないための保険 */
const MAX_FRAMES = 1000;
/** 推論に渡す画像の最大辺。モデルの入力は256pxなので、これ以上大きくしても精度は上がらない */
const WORK_EDGE = 640;
/** 1コマのシークがこれ以上返ってこなければ打ち切る */
const SEEK_TIMEOUT = 4000;

/* ------------------------------------------------------------------ */
/* データ形式                                                          */
/* ------------------------------------------------------------------ */

/**
 * 保存する形（0129 migration と一致させること）
 *   t: 各コマの時刻（ミリ秒）
 *   p: 各コマの 33関節×(x,y,z)。すべて1000倍した整数。検出できなかったコマは []
 */
export type PoseData = { v: 1; t: number[]; p: number[][] };

export type PoseTrack = {
  engine: string;
  fps: number;
  width: number;
  height: number;
  frames: number;
  detected: number;
  data: PoseData;
};

/** 1コマぶんの関節座標（x,y は 0〜1 の正規化、z は目安） */
export type Landmarks = { x: number; y: number; z: number }[];

/** BlazePose 33点のうち、ゴルフで使うものだけ名前を付けておく */
export const LM = {
  nose: 0,
  lShoulder: 11, rShoulder: 12,
  lElbow: 13, rElbow: 14,
  lWrist: 15, rWrist: 16,
  lIndex: 19, rIndex: 20,
  lHip: 23, rHip: 24,
  lKnee: 25, rKnee: 26,
  lAnkle: 27, rAnkle: 28,
  lFoot: 31, rFoot: 32,
} as const;

/** 描画する骨（顔まわりの細かい線は描かない。スイングでは邪魔にしかならない） */
const BONES: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],          // 胴体
  [11, 13], [13, 15], [12, 14], [14, 16],          // 腕
  [15, 19], [16, 20],                              // 手
  [23, 25], [25, 27], [24, 26], [26, 28],          // 脚
  [27, 31], [28, 32],                              // 足
];

/* ------------------------------------------------------------------ */
/* 解析                                                                */
/* ------------------------------------------------------------------ */

export type AnalyzeOptions = {
  /** 解析するフレームレート。30で十分見られる。速い動きを細かく見たいときだけ60 */
  fps?: number;
  onProgress?: (done: number, total: number, phase: string) => void;
  signal?: AbortSignal;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 署名URLのままだと canvas が汚染されて画素を読めない。Blobに落として同一オリジンにする */
async function toLocalUrl(src: string): Promise<{ url: string; revoke: () => void }> {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  } catch {
    // 取れなければ crossOrigin 指定で直接読ませる（Storage側のCORSが効いていれば通る）
    return { url: src, revoke: () => {} };
  }
}

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

let cached: { lm: PoseLandmarker; engine: string } | null = null;

/** Pose Landmarker を1回だけ作って使い回す（初回はwasm+モデルで約10MB読む） */
async function getLandmarker(): Promise<{ lm: PoseLandmarker; engine: string }> {
  if (cached) return cached;
  const { FilesetResolver, PoseLandmarker: PL } = await import("@mediapipe/tasks-vision");
  const local = await headOk(LOCAL_MODEL);
  const wasmBase = local ? LOCAL_WASM : CDN_WASM;
  const modelPath = local ? LOCAL_MODEL : CDN_MODEL;
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);

  const build = (delegate: "GPU" | "CPU") =>
    PL.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });

  let lm: PoseLandmarker;
  let delegate: "GPU" | "CPU" = "GPU";
  try {
    lm = await build("GPU");
  } catch {
    delegate = "CPU";
    lm = await build("CPU");
  }
  cached = { lm, engine: `mediapipe/${MODEL_FILE.replace(".task", "")}@${PKG_VERSION}/${delegate}${local ? "" : "/cdn"}` };
  return cached;
}

/** 解析器を捨てる（メモリを返す）。カルテを閉じるときに呼ぶ */
export function disposePose() {
  try { cached?.lm.close(); } catch { /* 破棄の失敗は無視してよい */ }
  cached = null;
}

/** 動画1本を解析して PoseTrack を返す */
export async function analyzePose(src: string, opts: AnalyzeOptions = {}): Promise<PoseTrack> {
  const fps = opts.fps === 60 ? 60 : 30;
  opts.onProgress?.(0, 1, "モデルを読み込み中");

  const { lm, engine } = await getLandmarker();
  const { url, revoke } = await toLocalUrl(src);

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("動画を読み込めませんでした")), 15000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error("動画を読み込めませんでした")); };
    });

    const W = video.videoWidth;
    const H = video.videoHeight;
    const dur = video.duration;
    if (!W || !H || !isFinite(dur) || dur <= 0) throw new Error("動画のサイズを取得できませんでした");

    const scale = Math.min(1, WORK_EDGE / Math.max(W, H));
    const cw = Math.max(2, Math.round(W * scale));
    const ch = Math.max(2, Math.round(H * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas を作れませんでした");

    const total = Math.min(MAX_FRAMES, Math.max(1, Math.floor(dur * fps)));
    const t: number[] = [];
    const p: number[][] = [];
    let detected = 0;
    let lastTs = -1;

    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new Error("中止しました");
      const sec = Math.min(dur - 0.001, i / fps);

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SEEK_TIMEOUT);
        video.onseeked = () => { clearTimeout(timer); resolve(); };
        video.currentTime = sec;
      });

      ctx.drawImage(video, 0, 0, cw, ch);
      // detectForVideo のタイムスタンプは必ず増えていないといけない
      const ts = Math.max(lastTs + 1, Math.round(sec * 1000));
      lastTs = ts;

      let row: number[] = [];
      try {
        const res = lm.detectForVideo(canvas, ts);
        const one = res.landmarks?.[0];
        if (one && one.length >= 33) {
          row = new Array(99);
          for (let k = 0; k < 33; k++) {
            row[k * 3] = Math.round(one[k].x * 1000);
            row[k * 3 + 1] = Math.round(one[k].y * 1000);
            row[k * 3 + 2] = Math.round((one[k].z ?? 0) * 1000);
          }
          detected++;
        }
      } catch {
        row = []; // このコマだけ落ちても続ける
      }

      t.push(ts);
      p.push(row);

      if (i % 5 === 0) {
        opts.onProgress?.(i + 1, total, "解析中");
        await wait(0); // UIを固まらせない
      }
    }

    opts.onProgress?.(total, total, "解析中");
    return { engine, fps, width: W, height: H, frames: total, detected, data: { v: 1, t, p } };
  } finally {
    video.src = "";
    revoke();
  }
}

/* ------------------------------------------------------------------ */
/* 取り出し・描画                                                       */
/* ------------------------------------------------------------------ */

/** 指定秒に一番近いコマの関節を返す。検出できていないコマなら null */
export function poseAt(data: PoseData | null | undefined, sec: number): Landmarks | null {
  if (!data || !data.t.length) return null;
  const ms = sec * 1000;
  // t は昇順なので二分探索
  let lo = 0;
  let hi = data.t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (data.t[mid] < ms) lo = mid + 1;
    else hi = mid;
  }
  const cand = [lo - 1, lo].filter((i) => i >= 0 && i < data.t.length);
  let best = cand[0];
  for (const i of cand) if (Math.abs(data.t[i] - ms) < Math.abs(data.t[best] - ms)) best = i;
  const row = data.p[best];
  if (!row || row.length < 99) return null;
  const out: Landmarks = new Array(33);
  for (let k = 0; k < 33; k++) {
    out[k] = { x: row[k * 3] / 1000, y: row[k * 3 + 1] / 1000, z: row[k * 3 + 2] / 1000 };
  }
  return out;
}

/**
 * 骨格を描く。座標は0〜1なので、表示中の動画の実寸（レターボックスを除いた矩形）を渡す。
 * ox/oy は動画が描かれている左上、dw/dh はその幅と高さ。
 */
export function drawPose(
  ctx: CanvasRenderingContext2D,
  lm: Landmarks,
  box: { ox: number; oy: number; dw: number; dh: number },
  color = "#4dd2ff"
) {
  const { ox, oy, dw, dh } = box;
  const X = (i: number) => ox + lm[i].x * dw;
  const Y = (i: number) => oy + lm[i].y * dh;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 黒い縁取りを先に敷く（明るい背景でも見える）
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = Math.max(5, dw / 110);
  ctx.beginPath();
  for (const [a, b] of BONES) { ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); }
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2.5, dw / 200);
  ctx.beginPath();
  for (const [a, b] of BONES) { ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); }
  ctx.stroke();

  // 関節の点
  const r = Math.max(2.5, dw / 190);
  ctx.fillStyle = "#fff";
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    ctx.beginPath();
    ctx.arc(X(i), Y(i), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 肩ライン・腰ラインは太めに（回旋量を目で見るため）
  ctx.lineWidth = Math.max(3, dw / 150);
  ctx.strokeStyle = "#ffd54d";
  ctx.beginPath(); ctx.moveTo(X(11), Y(11)); ctx.lineTo(X(12), Y(12)); ctx.stroke();
  ctx.strokeStyle = "#7CFC66";
  ctx.beginPath(); ctx.moveTo(X(23), Y(23)); ctx.lineTo(X(24), Y(24)); ctx.stroke();

  // 頭の位置
  ctx.fillStyle = "#ff4d4d";
  ctx.beginPath(); ctx.arc(X(0), Y(0), r * 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * 表示中の <video> のうち、実際に映像が描かれている矩形を求める。
 * object-fit: contain（既定）なので上下または左右に黒帯が入る。
 */
export function videoBox(v: HTMLVideoElement, cw: number, ch: number) {
  const vw = v.videoWidth || 16;
  const vh = v.videoHeight || 9;
  const s = Math.min(cw / vw, ch / vh);
  const dw = vw * s;
  const dh = vh * s;
  return { ox: (cw - dw) / 2, oy: (ch - dh) / 2, dw, dh };
}

/* ------------------------------------------------------------------ */
/* 角度                                                                */
/* ------------------------------------------------------------------ */

export type PoseMetrics = {
  /** 肩ラインの傾き（度）。画面の水平が0、右肩が下がるとプラス */
  shoulder: number;
  /** 腰ラインの傾き（度） */
  hip: number;
  /** 肩と腰の差＝ねじれ量の目安（2D投影なので絶対値ではなく前回との差で見る） */
  xFactor: number;
  /** 前傾（背骨の傾き）。垂直が0、前に倒れるとプラス */
  spine: number;
  /** 頭の位置（0〜1の正規化座標） */
  head: { x: number; y: number };
  /** 肩幅（正規化）。頭の移動量をこれで割ると身長差に左右されない */
  shoulderWidth: number;
};

const deg = (rad: number) => (rad * 180) / Math.PI;

export function poseMetrics(lm: Landmarks): PoseMetrics {
  const ls = lm[LM.lShoulder], rs = lm[LM.rShoulder];
  const lh = lm[LM.lHip], rh = lm[LM.rHip];
  const shoulder = deg(Math.atan2(rs.y - ls.y, rs.x - ls.x));
  const hip = deg(Math.atan2(rh.y - lh.y, rh.x - lh.x));
  const smx = (ls.x + rs.x) / 2, smy = (ls.y + rs.y) / 2;
  const hmx = (lh.x + rh.x) / 2, hmy = (lh.y + rh.y) / 2;
  const spine = deg(Math.atan2(hmx - smx, hmy - smy));
  return {
    shoulder: norm180(shoulder),
    hip: norm180(hip),
    xFactor: norm180(shoulder - hip),
    spine: norm180(spine),
    head: { x: lm[LM.nose].x, y: lm[LM.nose].y },
    shoulderWidth: Math.hypot(rs.x - ls.x, rs.y - ls.y) || 0.001,
  };
}

function norm180(d: number) {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return Number(x.toFixed(1));
}

/**
 * アドレス時の頭の位置からのブレ。肩幅を1として何%動いたかで返す
 * （＝身長やカメラ距離が違っても比較できる）
 */
export function headSway(base: PoseMetrics, now: PoseMetrics) {
  const dx = (now.head.x - base.head.x) / base.shoulderWidth;
  const dy = (now.head.y - base.head.y) / base.shoulderWidth;
  return { x: Math.round(dx * 100), y: Math.round(dy * 100) };
}
