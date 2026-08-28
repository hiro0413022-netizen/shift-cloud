/**
 * スイング解析 — ブラウザ専用（骨格 #174 / クラブ軌跡・プレーン #175）
 *
 * 何をするか（撮り終わった動画を1回のコマ送りで全部やる）:
 *   1. 骨格   … MediaPipe Pose Landmarker で33関節
 *   2. クラブ … フレーム間差分に「両手首を原点とした放射状スキャン」をかけてシャフトの向きを取り、
 *               その先端をヘッドとみなす。ヘッド自体を追わないのは、
 *               インパクト前後でヘッドが帯状にブレて点として存在しなくなるため。
 *   3. プレーン… アドレスの手とテークバック初期のヘッドを結んだ線を基準面にする。
 *
 * なぜ「撮影中」ではなく「撮り終わってから」か:
 *   リアルタイム解析はスマホだと 15〜25fps まで落ちてコマを取りこぼす。
 *   スイングは 0.25 秒で終わるので取りこぼしは致命傷になる。
 *
 * ⚠ 単眼カメラの限界（数字の読み方）:
 *   ここで出る角度はすべて「画面に映った見た目の角度」。三脚の位置・高さ・距離が変われば
 *   同じスイングでも数字が変わる。絶対値ではなく **同じ生徒の前回との差** で読むこと。
 *
 * ⚠ 60fps ではインパクト前後は物理的に追えない:
 *   ヘッドは秒速40m前後＝60fpsで1コマ60〜80cm動く。そこは軌跡が飛ぶのが正常。
 *   細かく見たいなら iPhone 純正カメラのスローモーション（120/240fps）で撮って取り込む。
 *
 * 座標の約束:
 *   保存する x,y は 0〜1 の正規化。**角度・距離を計算するときは必ず px に戻す**
 *   （9:16 の動画では x と y のスケールが違うので、正規化のまま atan2 すると角度が狂う）。
 */

import type { PoseLandmarker } from "@mediapipe/tasks-vision";

const PKG_VERSION = "1.0.1";
const MODEL_FILE = "pose_landmarker_lite.task";

const LOCAL_WASM = "/mp/wasm";
const LOCAL_MODEL = `/mp/${MODEL_FILE}`;
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${PKG_VERSION}/wasm`;
const CDN_MODEL = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/${MODEL_FILE}`;

/** 解析にかける最大コマ数。長い動画・高fps指定で端末が固まらないための保険 */
const MAX_FRAMES = 1200;
/** 推論とスキャンに使う画像の最大辺。モデルの入力は256pxなので上げても精度は伸びない */
const WORK_EDGE = 640;
/** 1コマのシークがこれ以上返ってこなければ打ち切る */
const SEEK_TIMEOUT = 4000;

/* ------------------------------------------------------------------ */
/* データ形式（0129 / 0130 と一致させること）                          */
/* ------------------------------------------------------------------ */

/** 骨格。t=ミリ秒、p=33関節×(x,y,z)を1000倍した整数。未検出コマは [] */
export type PoseData = { v: 1; t: number[]; p: number[][] };

/** クラブヘッド。p=[x*1000, y*1000, conf(0〜100)]。未検出コマは []。clubLen は画面幅を1000としたときの推定クラブ長 */
export type ClubData = { v: 1; t: number[]; p: number[][]; clubLen: number };

/** スイングプレーンの基準線（0〜1の正規化座標） */
export type Plane = { x1: number; y1: number; x2: number; y2: number; _method: "address" | "manual" };

export type SwingTrack = {
  engine: string;
  fps: number;
  srcFps: number | null;
  width: number;
  height: number;
  frames: number;
  detected: number;
  data: PoseData;
  club: ClubData | null;
  plane: Plane | null;
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
/* 下ごしらえ                                                          */
/* ------------------------------------------------------------------ */

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

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

/**
 * 動画の実測フレームレート。
 * 「60fpsで撮ったつもりが30fpsだった」「純正スローの240fpsが本当に240コマ入っているか」を
 * 憶測でなく数字で確かめるために測る。requestVideoFrameCallback が無い端末では null。
 */
export async function detectFps(video: HTMLVideoElement): Promise<number | null> {
  const v = video as RVFCVideo;
  if (typeof v.requestVideoFrameCallback !== "function") return null;
  const times: number[] = [];
  const wasMuted = v.muted;
  v.muted = true;
  try {
    await v.play().catch(() => {});
    await new Promise<void>((resolve) => {
      const stop = setTimeout(resolve, 2500);
      const tick = (_now: number, meta: { mediaTime: number }) => {
        times.push(meta.mediaTime);
        if (times.length >= 40) { clearTimeout(stop); resolve(); return; }
        v.requestVideoFrameCallback!(tick);
      };
      v.requestVideoFrameCallback!(tick);
    });
  } finally {
    v.pause();
    v.muted = wasMuted;
  }
  const d: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt > 0.0005 && dt < 0.2) d.push(dt);
  }
  if (d.length < 5) return null;
  d.sort((a, b) => a - b);
  const med = d[Math.floor(d.length / 2)];
  return med > 0 ? Math.round(1 / med) : null;
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

/** 解析器を捨てる（メモリを返す） */
export function disposePose() {
  try { cached?.lm.close(); } catch { /* 破棄の失敗は無視してよい */ }
  cached = null;
}

/* ------------------------------------------------------------------ */
/* クラブのシャフト検出                                                */
/* ------------------------------------------------------------------ */

/** 差分がこの値を超えた画素だけ「動いた」とみなす（8bit輝度） */
const MOTION_THR = 22;

export type ShaftHit = { ang: number; r: number; score: number; conf: number };

/**
 * 両手首の中点を原点に、放射状に「動いた量」を足し上げてシャフトの向きを探す。
 *
 * なぜヘッドを直接探さないか:
 *   ヘッドは小さくて速く、インパクト前後では点ではなく帯になる。
 *   一方シャフトは長い直線なので、ブレていても「その方向に動いた画素が並ぶ」形で必ず残る。
 *
 * なぜ内側（r が小さいところ）を採点から外すか:
 *   手首から体側に伸びる腕も動くので、近距離を入れると腕の方向が勝つことがある。
 *   クラブは腕より長いので、外側の帯だけ見れば自然にクラブが選ばれる。
 */
/** テストから叩けるように export（純関数・画像処理の要） */
export function scanShaft(
  prev: Uint8Array,
  cur: Uint8Array,
  cw: number,
  ch: number,
  wx: number,
  wy: number,
  R: number,
  prevAng: number | null
): ShaftHit | null {
  if (!(R > 8)) return null;
  const rIn = R * 0.42;
  const rOut = R * 1.08;
  const step = 1.6;

  const sample = (a: number) => {
    const rad = (a * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    let sum = 0;
    let last = 0;
    for (let r = rIn; r <= rOut; r += step) {
      const x = (wx + dx * r) | 0;
      const y = (wy + dy * r) | 0;
      if (x < 0 || y < 0 || x >= cw || y >= ch) break;
      const i = y * cw + x;
      const d = Math.abs(cur[i] - prev[i]);
      if (d > MOTION_THR) {
        sum += d;
        if (r > last) last = r;
      }
    }
    return { sum, last };
  };

  let total = 0;
  let n = 0;
  let bestA = 0;
  let bestSum = -1;
  let bestLast = 0;

  for (let a = 0; a < 360; a += 3) {
    const { sum, last } = sample(a);
    // 直前のコマと向きが近ければ少しだけ後押しする（クラブは連続して動く）。
    // ただし切り返しは1コマで20度以上回るので、効きは弱く・幅は広く。
    let s = sum;
    if (prevAng != null) {
      let d = Math.abs(((a - prevAng + 540) % 360) - 180);
      if (d < 45) s *= 1 + 0.12 * (1 - d / 45);
    }
    total += sum;
    n++;
    if (s > bestSum) { bestSum = s; bestA = a; bestLast = last; }
  }
  if (bestSum <= 0) return null;

  // 3度刻みで見つけた山を1度刻みで詰める
  for (let a = bestA - 3; a <= bestA + 3; a++) {
    const { sum, last } = sample((a + 360) % 360);
    if (sum > bestSum) { bestSum = sum; bestA = (a + 360) % 360; bestLast = last; }
  }

  const mean = total / Math.max(1, n);
  // 「他の向きに比べてどれだけ突出しているか」を確からしさにする
  const conf = Math.max(0, Math.min(1, (bestSum / (mean + 1) - 1.6) / 3.5));
  if (bestLast < rIn) return null;
  return { ang: bestA, r: bestLast, score: bestSum, conf };
}

const percentile = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.max(0, Math.min(a.length - 1, Math.round((a.length - 1) * p)))];
};

/* ------------------------------------------------------------------ */
/* 解析本体                                                            */
/* ------------------------------------------------------------------ */

export type AnalyzeOptions = {
  /** 解析するフレームレート。30で骨格は十分。クラブを細かく見たいときだけ60/120 */
  fps?: number;
  onProgress?: (done: number, total: number, phase: string) => void;
  signal?: AbortSignal;
};

const ALLOWED_FPS = [30, 60, 120];

/** 動画1本を解析して 骨格＋クラブ軌跡＋プレーン を返す */
export async function analyzeSwing(src: string, opts: AnalyzeOptions = {}): Promise<SwingTrack> {
  const fps = ALLOWED_FPS.includes(opts.fps ?? 30) ? (opts.fps as number) : 30;
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

    opts.onProgress?.(0, 1, "フレームレートを計測中");
    const srcFps = await detectFps(video).catch(() => null);
    video.currentTime = 0;

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

    // クラブ検出の作業領域（毎コマ確保しない）
    let gA = new Uint8Array(cw * ch);
    let gB = new Uint8Array(cw * ch);
    let hasPrev = false;
    let prevAng: number | null = null;
    const hits: ({ wx: number; wy: number; hit: ShaftHit } | null)[] = [];

    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new Error("中止しました");
      const sec = Math.min(dur - 0.001, i / fps);

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SEEK_TIMEOUT);
        video.onseeked = () => { clearTimeout(timer); resolve(); };
        video.currentTime = sec;
      });

      ctx.drawImage(video, 0, 0, cw, ch);

      // 輝度だけ取り出す（差分に色は要らない）
      const img = ctx.getImageData(0, 0, cw, ch).data;
      for (let j = 0, k = 0; j < gA.length; j++, k += 4) {
        gA[j] = (img[k] * 77 + img[k + 1] * 151 + img[k + 2] * 28) >> 8;
      }

      // detectForVideo のタイムスタンプは必ず増えていないといけない
      const ts = Math.max(lastTs + 1, Math.round(sec * 1000));
      lastTs = ts;

      let row: number[] = [];
      let one: { x: number; y: number; z?: number; visibility?: number }[] | undefined;
      try {
        const res = lm.detectForVideo(canvas, ts);
        one = res.landmarks?.[0];
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

      // クラブ: 前コマがあり、骨格から手首と体の大きさが取れたときだけ
      let hit: { wx: number; wy: number; hit: ShaftHit } | null = null;
      if (hasPrev && one && one.length >= 33) {
        const wx = ((one[LM.lWrist].x + one[LM.rWrist].x) / 2) * cw;
        const wy = ((one[LM.lWrist].y + one[LM.rWrist].y) / 2) * ch;
        const smx = ((one[LM.lShoulder].x + one[LM.rShoulder].x) / 2) * cw;
        const smy = ((one[LM.lShoulder].y + one[LM.rShoulder].y) / 2) * ch;
        const amx = ((one[LM.lAnkle].x + one[LM.rAnkle].x) / 2) * cw;
        const amy = ((one[LM.lAnkle].y + one[LM.rAnkle].y) / 2) * ch;
        // 肩〜足首を体の物差しにする。クラブはその 0.7〜0.85 倍（7I〜DR）
        let body = Math.hypot(amx - smx, amy - smy);
        if (!(body > 20)) {
          const sw = Math.hypot((one[LM.rShoulder].x - one[LM.lShoulder].x) * cw, (one[LM.rShoulder].y - one[LM.lShoulder].y) * ch);
          body = sw * 3.2;
        }
        const found = scanShaft(gB, gA, cw, ch, wx, wy, body * 0.95, prevAng);
        if (found) {
          hit = { wx, wy, hit: found };
          if (found.conf > 0.3) prevAng = found.ang;
        }
      }
      hits.push(hit);

      t.push(ts);
      p.push(row);

      // 次のコマのために前コマとして持つ（バッファは入れ替えるだけ）
      const swap = gB; gB = gA; gA = swap;
      hasPrev = true;

      if (i % 5 === 0) {
        opts.onProgress?.(i + 1, total, "解析中");
        await wait(0); // UIを固まらせない
      }
    }

    opts.onProgress?.(total, total, "解析中");

    const club = buildClub(hits, t, cw, ch);
    const plane = club ? planeFromAddress({ v: 1, t, p }, club, W, H) : null;

    return {
      engine, fps, srcFps, width: W, height: H, frames: total, detected,
      data: { v: 1, t, p }, club, plane,
    };
  } finally {
    video.src = "";
    revoke();
  }
}

/**
 * コマごとの当たりをクラブ軌跡にまとめる。
 * クラブ長は「各コマで最も遠くまで動いた距離」の80パーセンタイル
 * （＝一番よく写っているコマに合わせる。平均だと短い側に引っぱられる）。
 */
/** テストから叩けるように export */
export function buildClub(
  hits: ({ wx: number; wy: number; hit: ShaftHit } | null)[],
  t: number[],
  cw: number,
  ch: number
): ClubData | null {
  const good = hits.filter((h): h is NonNullable<typeof h> => !!h && h.hit.conf > 0.25);
  if (good.length < 6) return null;
  const clubPx = percentile(good.map((g) => g.hit.r), 0.8);
  if (!(clubPx > 8)) return null;

  const raw: ([number, number, number] | null)[] = hits.map((h) => {
    if (!h || h.hit.conf <= 0.15) return null;
    const r = Math.max(clubPx * 0.45, Math.min(clubPx * 1.05, h.hit.r));
    const rad = (h.hit.ang * Math.PI) / 180;
    return [h.wx + Math.cos(rad) * r, h.wy + Math.sin(rad) * r, h.hit.conf];
  });

  // 3コマの移動平均（前後が欠けていれば平均しない）。点のガタつきだけ取る
  const out: number[][] = raw.map((v, i) => {
    if (!v) return [];
    const a = raw[i - 1];
    const b = raw[i + 1];
    const xs = [v[0]], ys = [v[1]];
    if (a) { xs.push(a[0]); ys.push(a[1]); }
    if (b) { xs.push(b[0]); ys.push(b[1]); }
    const x = xs.reduce((s, n) => s + n, 0) / xs.length;
    const y = ys.reduce((s, n) => s + n, 0) / ys.length;
    return [Math.round((x / cw) * 1000), Math.round((y / ch) * 1000), Math.round(v[2] * 100)];
  });

  if (out.filter((r) => r.length).length < 6) return null;
  return { v: 1, t, p: out, clubLen: Math.round((clubPx / cw) * 1000) };
}

/* ------------------------------------------------------------------ */
/* 取り出し                                                            */
/* ------------------------------------------------------------------ */

/** 指定秒に一番近いコマの番号 */
function nearestIndex(t: number[], sec: number): number {
  const ms = sec * 1000;
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < ms) lo = mid + 1;
    else hi = mid;
  }
  const cand = [lo - 1, lo].filter((i) => i >= 0 && i < t.length);
  let best = cand[0] ?? 0;
  for (const i of cand) if (Math.abs(t[i] - ms) < Math.abs(t[best] - ms)) best = i;
  return best;
}

/** 指定秒に一番近いコマの関節。検出できていないコマなら null */
export function poseAt(data: PoseData | null | undefined, sec: number): Landmarks | null {
  if (!data || !data.t.length) return null;
  const row = data.p[nearestIndex(data.t, sec)];
  if (!row || row.length < 99) return null;
  const out: Landmarks = new Array(33);
  for (let k = 0; k < 33; k++) {
    out[k] = { x: row[k * 3] / 1000, y: row[k * 3 + 1] / 1000, z: row[k * 3 + 2] / 1000 };
  }
  return out;
}

/** 指定秒に一番近いコマのヘッド位置（0〜1）。取れていなければ null */
export function clubAt(club: ClubData | null | undefined, sec: number): { x: number; y: number; conf: number } | null {
  if (!club || !club.t.length) return null;
  const row = club.p[nearestIndex(club.t, sec)];
  if (!row || row.length < 3) return null;
  return { x: row[0] / 1000, y: row[1] / 1000, conf: row[2] / 100 };
}

/* ------------------------------------------------------------------ */
/* スイングプレーン                                                    */
/* ------------------------------------------------------------------ */

/**
 * アドレスの手 → テークバック初期のヘッド を結んだ線を基準面にする。
 *
 * なぜアドレスのコマそのものからシャフトを取らないか:
 *   検出はフレーム間の「動き」を見ているので、静止しているアドレスでは何も出ない。
 *   動き出した最初の確かなコマなら、ヘッドはまだボールのすぐそばにあるので、
 *   アドレスのシャフト線とほぼ同じ線が引ける。
 */
export function planeFromAddress(pose: PoseData, club: ClubData, W: number, H: number): Plane | null {
  const firstIdx = club.p.findIndex((r) => r.length === 3 && r[2] >= 30);
  if (firstIdx < 0) return null;
  const hx = club.p[firstIdx][0] / 1000;
  const hy = club.p[firstIdx][1] / 1000;

  const row = pose.p[firstIdx];
  if (!row || row.length < 99) return null;
  const wx = (row[LM.lWrist * 3] + row[LM.rWrist * 3]) / 2000;
  const wy = (row[LM.lWrist * 3 + 1] + row[LM.rWrist * 3 + 1]) / 2000;

  // 角度が正しくなるよう px に直してから向きを出し、正規化に戻す
  const dx = (hx - wx) * W;
  const dy = (hy - wy) * H;
  const len = Math.hypot(dx, dy);
  if (!(len > 1)) return null;
  const ux = dx / len;
  const uy = dy / len;
  const ext = Math.max(W, H) * 1.4;
  return {
    x1: Number((wx - (ux * ext) / W).toFixed(4)),
    y1: Number((wy - (uy * ext) / H).toFixed(4)),
    x2: Number((wx + (ux * ext) / W).toFixed(4)),
    y2: Number((wy + (uy * ext) / H).toFixed(4)),
    _method: "address",
  };
}

export type PlaneMetrics = {
  /** 水平からのプレーン角（度・0〜90） */
  angle: number;
  /** 各フェーズでのプレーンからのズレ（クラブ長を100とした比率・＋が上＝スティープ側） */
  top: number | null;
  down: number | null;
  impact: number | null;
  /** バックスイング／ダウンスイング中の最大ズレ */
  backMax: number | null;
  downMax: number | null;
};

/** 点からプレーン線までの符号つき距離（px）。＋が線より上 */
export function signedDist(plane: Plane, x: number, y: number, W: number, H: number) {
  let ax = plane.x1 * W, ay = plane.y1 * H;
  let bx = plane.x2 * W, by = plane.y2 * H;
  // 線の向き（どちらの端を先に書いたか）で符号が反転しないよう、必ず左→右にそろえてから測る。
  // 手で引いた線は右から左に引かれることもあるので、ここを揃えないと上下が入れ替わる。
  if (bx < ax || (bx === ax && by < ay)) { const tx = ax, ty = ay; ax = bx; ay = by; bx = tx; by = ty; }
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return 0;
  // 画面の y は下向きなので、この外積の符号は「線より上＝＋」になる
  return ((x - ax) * dy - (y - ay) * dx) / len;
}

export function planeMetrics(
  plane: Plane,
  club: ClubData,
  W: number,
  H: number,
  phases?: { top?: number; downswing?: number; impact?: number } | null
): PlaneMetrics {
  const dx = (plane.x2 - plane.x1) * W;
  const dy = (plane.y2 - plane.y1) * H;
  let angle = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  if (angle > 90) angle = 180 - angle;

  const clubPx = (club.clubLen / 1000) * W || 1;
  const at = (sec?: number) => {
    if (typeof sec !== "number") return null;
    const c = clubAt(club, sec);
    if (!c || c.conf < 0.2) return null;
    return Math.round((signedDist(plane, c.x * W, c.y * H, W, H) / clubPx) * 100);
  };

  // インパクト前後（バック／ダウンの区切り）はフェーズが無ければ尺の真ん中で割る
  const impactMs = typeof phases?.impact === "number" ? phases.impact * 1000 : club.t[Math.floor(club.t.length * 0.62)];
  let backMax: number | null = null;
  let downMax: number | null = null;
  for (let i = 0; i < club.p.length; i++) {
    const r = club.p[i];
    if (r.length !== 3 || r[2] < 30) continue;
    const d = Math.round((signedDist(plane, (r[0] / 1000) * W, (r[1] / 1000) * H, W, H) / clubPx) * 100);
    if (club.t[i] <= impactMs) {
      if (backMax == null || Math.abs(d) > Math.abs(backMax)) backMax = d;
    } else if (downMax == null || Math.abs(d) > Math.abs(downMax)) downMax = d;
  }

  return {
    angle: Number(angle.toFixed(1)),
    top: at(phases?.top),
    down: at(phases?.downswing),
    impact: at(phases?.impact),
    backMax,
    downMax,
  };
}

/* ------------------------------------------------------------------ */
/* 描画                                                                */
/* ------------------------------------------------------------------ */

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

export type Box = { ox: number; oy: number; dw: number; dh: number };

/** 骨格を描く */
export function drawPose(ctx: CanvasRenderingContext2D, lm: Landmarks, box: Box, color = "#4dd2ff") {
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

  ctx.fillStyle = "#ff4d4d";
  ctx.beginPath(); ctx.arc(X(0), Y(0), r * 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/**
 * クラブヘッドの軌跡。
 * 確からしさが低い区間はわざと薄くする（＝インパクト前後で線が飛ぶのを
 * 「取れていない」と分かる形で見せる。滑らかにつないで嘘をつかない）。
 */
export function drawClubTrace(
  ctx: CanvasRenderingContext2D,
  club: ClubData,
  box: Box,
  sec: number,
  opts: { color?: string; showAll?: boolean } = {}
) {
  const { ox, oy, dw, dh } = box;
  const color = opts.color ?? "#ff9f1c";
  const upto = opts.showAll ? Infinity : sec * 1000 + 1;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const lw = Math.max(2, dw / 220);

  let prev: [number, number, number] | null = null;
  for (let i = 0; i < club.p.length; i++) {
    if (club.t[i] > upto) break;
    const r = club.p[i];
    if (r.length !== 3) { prev = null; continue; }
    const x = ox + (r[0] / 1000) * dw;
    const y = oy + (r[1] / 1000) * dh;
    const c = r[2] / 100;
    if (prev) {
      ctx.globalAlpha = Math.max(0.15, Math.min(1, (c + prev[2]) / 2));
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    prev = [x, y, c];
  }
  ctx.globalAlpha = 1;

  // いまのコマのヘッドとシャフト
  const now = clubAt(club, sec);
  if (now && now.conf >= 0.2) {
    const x = ox + now.x * dw;
    const y = oy + now.y * dh;
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(4, dw / 120), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** スイングプレーンの基準線 */
export function drawPlane(ctx: CanvasRenderingContext2D, plane: Plane, box: Box, color = "#ffd54d") {
  const { ox, oy, dw, dh } = box;
  ctx.save();
  ctx.setLineDash([Math.max(6, dw / 60), Math.max(4, dw / 90)]);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = Math.max(4, dw / 130);
  ctx.beginPath();
  ctx.moveTo(ox + plane.x1 * dw, oy + plane.y1 * dh);
  ctx.lineTo(ox + plane.x2 * dw, oy + plane.y2 * dh);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, dw / 220);
  ctx.beginPath();
  ctx.moveTo(ox + plane.x1 * dw, oy + plane.y1 * dh);
  ctx.lineTo(ox + plane.x2 * dw, oy + plane.y2 * dh);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 体の角度                                                            */
/* ------------------------------------------------------------------ */

export type PoseMetrics = {
  /** 肩ラインの傾き（度）。画面の水平が0、右肩が下がるとプラス */
  shoulder: number;
  /** 腰ラインの傾き（度） */
  hip: number;
  /** 肩と腰の差＝ねじれ量の目安 */
  xFactor: number;
  /** 前傾（背骨の傾き）。垂直が0、前に倒れるとプラス */
  spine: number;
  /** 頭の位置（px） */
  head: { x: number; y: number };
  /** 肩幅（px）。頭の移動量をこれで割ると身長差に左右されない */
  shoulderWidth: number;
};

const deg = (rad: number) => (rad * 180) / Math.PI;

function norm180(d: number) {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return Number(x.toFixed(1));
}

/**
 * 角度は必ず px に直してから計算する。
 * 9:16 の動画で正規化座標のまま atan2 すると、縦横のスケールが違うぶん角度が狂う。
 */
export function poseMetrics(lm: Landmarks, W: number, H: number): PoseMetrics {
  const X = (i: number) => lm[i].x * W;
  const Y = (i: number) => lm[i].y * H;
  const shoulder = deg(Math.atan2(Y(LM.rShoulder) - Y(LM.lShoulder), X(LM.rShoulder) - X(LM.lShoulder)));
  const hip = deg(Math.atan2(Y(LM.rHip) - Y(LM.lHip), X(LM.rHip) - X(LM.lHip)));
  const smx = (X(LM.lShoulder) + X(LM.rShoulder)) / 2, smy = (Y(LM.lShoulder) + Y(LM.rShoulder)) / 2;
  const hmx = (X(LM.lHip) + X(LM.rHip)) / 2, hmy = (Y(LM.lHip) + Y(LM.rHip)) / 2;
  const spine = deg(Math.atan2(hmx - smx, hmy - smy));
  return {
    shoulder: norm180(shoulder),
    hip: norm180(hip),
    xFactor: norm180(shoulder - hip),
    spine: norm180(spine),
    head: { x: X(LM.nose), y: Y(LM.nose) },
    shoulderWidth: Math.hypot(X(LM.rShoulder) - X(LM.lShoulder), Y(LM.rShoulder) - Y(LM.lShoulder)) || 1,
  };
}

/** アドレス時の頭の位置からのブレ。肩幅を100%として何%動いたか */
export function headSway(base: PoseMetrics, now: PoseMetrics) {
  return {
    x: Math.round(((now.head.x - base.head.x) / base.shoulderWidth) * 100),
    y: Math.round(((now.head.y - base.head.y) / base.shoulderWidth) * 100),
  };
}
