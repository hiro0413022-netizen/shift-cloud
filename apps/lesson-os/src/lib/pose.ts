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
  /** クラブ検出がどこで落ちたか（取れなかったときに現場で打つ手を決めるため） */
  diag: ClubDiag | null;
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

/** 動いたとみなす差分の下限。実際の閾値は毎コマ画面から測って決める（下の motionThreshold） */
const MOTION_FLOOR = 10;

/**
 * このコマの「動いた量」の地の高さを測って閾値を決める。
 *
 * なぜ固定値ではだめか:
 *   手持ち撮影・照明のちらつき・動画圧縮で、画面全体が毎コマ揺れている量が動画ごとに違う。
 *   固定22だと、揺れの多い動画では全部が「動いた」になり、静かな動画では何も拾えない。
 *   画面の85パーセンタイルを地の高さとみなし、そこを超えたものだけをクラブの候補にする。
 */
export function motionThreshold(prev: Uint8Array, cur: Uint8Array, cw: number, ch: number): number {
  const vals: number[] = [];
  for (let y = 0; y < ch; y += 6) {
    for (let x = 0; x < cw; x += 6) {
      const i = y * cw + x;
      vals.push(Math.abs(cur[i] - prev[i]));
    }
  }
  if (!vals.length) return MOTION_FLOOR;
  vals.sort((a, b) => a - b);
  const p85 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.85))];
  return Math.max(MOTION_FLOOR, p85 + 4);
}

export type ShaftHit = {
  ang: number;
  /** ヘッドまでの距離(px) */
  r: number;
  /** rIn〜r の間で「線が並んでいた」割合。シャフトは線なので高くなる */
  fill: number;
  /** 素点。1サンプルあたり約1.2なので、シャフト全部が写れば帯のサンプル数に近づく */
  score: number;
  /** 素点をサンプル数で割ったもの。**本物のシャフトは0.4以上・ノイズは0.1未満**とはっきり分かれる */
  norm: number;
  conf: number;
};

/** 帯の中で取るサンプル数（rIn〜rOut を step で刻んだ数。norm の分母） */
const BAND_SAMPLES = 48;

/**
 * 両手首の中点を原点に、放射状に「動いた画素の並び」を探してシャフトの向きを取る。
 * 1本に絞らず、角度スコアの山を上位K個返す（後段のDPが前後のつながりから選ぶ）。
 *
 * なぜヘッドを直接探さないか:
 *   ヘッドは小さくて速く、インパクト前後では点ではなく帯になる。
 *   一方シャフトは長い直線なので、ブレていても「その方向に動いた画素が並ぶ」形で必ず残る。
 *
 * 3つの仕掛けが全部要る（どれか1つでも欠けると実機で取れない）:
 *   1. 光線に直角方向の幅   手首の中点は数pxずれ角度も1度刻み。r=200pxで1度ずれると横に3.5px外れる
 *   2. 中心 − 周り（ridge） 体の輪郭や背景の明滅は「太い」。シャフトは「細い」。細いものだけ残す
 *   3. fill（並びの詰まり） ノイズは点在するだけで並ばない。シャフトは手首からヘッドまで続く
 */
export function scanShaftCandidates(
  prev: Uint8Array,
  cur: Uint8Array,
  cw: number,
  ch: number,
  wx: number,
  wy: number,
  R: number,
  thr: number,
  K = 4
): ShaftHit[] {
  if (!(R > 8)) return [];
  const rIn = R * 0.3;
  const rOut = R * 1.1;
  const step = Math.max(1, R / 60);

  const sample = (a: number) => {
    const rad = (a * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const nx = -dy;
    const ny = dx;
    let n = 0;
    let cum = 0;
    let sc = 0;
    let bestR = 0;
    let bestFill = 0;
    let bestSc = 0;
    for (let r = rIn; r <= rOut; r += step) {
      const x = (wx + dx * r) | 0;
      const y = (wy + dy * r) | 0;
      if (x < 0 || y < 0 || x >= cw || y >= ch) break;
      n++;
      const w = 1 + r * 0.025;   // シャフトの太さぶん
      const far = w * 3 + 5;     // 「周り」を見る距離
      const pick = (o: number) => {
        const ox = (wx + dx * r + nx * o) | 0;
        const oy = (wy + dy * r + ny * o) | 0;
        if (ox < 0 || oy < 0 || ox >= cw || oy >= ch) return 0;
        const j = oy * cw + ox;
        return Math.abs(cur[j] - prev[j]);
      };
      const center = Math.max(pick(0), pick(-w), pick(w));
      const surround = (pick(-far) + pick(far)) / 2;
      if (center - surround > thr && center > thr) {
        cum++;
        sc += 0.5 + r / R;       // 遠くまで届いている向きを優遇する
        const fill = cum / n;
        if (fill >= 0.5) { bestR = r; bestFill = fill; bestSc = sc; }
      }
    }
    return { r: bestR, fill: bestFill, score: bestSc };
  };

  const STEP = 3;
  const n = 360 / STEP;
  const got: { r: number; fill: number; score: number }[] = new Array(n);
  for (let i = 0; i < n; i++) got[i] = sample(i * STEP);

  // 角度スコアの「山」だけを候補にする（同じ山の隣どうしを何本も拾わない）
  const peaks: ShaftHit[] = [];
  for (let i = 0; i < n; i++) {
    const a = got[(i - 1 + n) % n].score;
    const b = got[i].score;
    const c = got[(i + 1) % n].score;
    if (b > 0 && b >= a && b > c) {   // 同点が続く「肩」で同じ山を何本も拾わない
      peaks.push({ ang: i * STEP, r: got[i].r, fill: got[i].fill, score: b, norm: 0, conf: 0 });
    }
  }
  peaks.sort((x, y) => y.score - x.score);
  const top = peaks.slice(0, K);
  for (const t of top) {
    // 3度刻みで見つけた山を1度刻みで詰める
    for (let a = t.ang - 2; a <= t.ang + 2; a++) {
      const gg = sample((a + 360) % 360);
      if (gg.score > t.score) { t.ang = (a + 360) % 360; t.r = gg.r; t.fill = gg.fill; t.score = gg.score; }
    }
    t.norm = t.score / BAND_SAMPLES;
    t.conf = Math.max(0, Math.min(1, (t.norm / 0.6) * Math.min(1, t.fill / 0.8)));
  }
  return top.filter((t) => t.r >= rIn && t.score > 0);
}

/** 本物のシャフトはこの値を超える。ノイズは 0.1 未満なので、ここはかなり素直に効く */
const CLUB_GATE = 0.35;
/** これを超えたらもう十分きれいに出ている＝それ以上コマ間隔を広げない */
const CLUB_GOOD = 0.45;
/** 何コマ前と比べるかの候補（スロー撮影ほど大きい値が要る） */
export const REF_GAPS = [1, 2, 4, 8, 12];
export const MAX_REF_GAP = 12;

const percentile = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.max(0, Math.min(a.length - 1, Math.round((a.length - 1) * p)))];
};

/**
 * 検出がどこで落ちたかを残す。
 * 「クラブ軌跡が取れませんでした」だけだと現場で打つ手が無いので、
 * 段階ごとの残り数と、画面の動きの地の高さを必ず持って帰る。
 */
export type ClubDiag = {
  frames: number;
  withPose: number;   // 手首が取れたコマ
  withRay: number;    // シャフトらしい向きが1本以上あったコマ
  kept: number;       // 確からしさで残ったコマ
  final: number;      // 前後のつながりで残ったコマ
  thr: number;        // 動いたとみなす閾値の中央値
  fill: number;       // 線の詰まり具合の中央値（%）
  conf: number;       // 確からしさの中央値（%）
  gap: number;        // 実際に使った「何コマ前と比べたか」の中央値
};

/** DPに渡すコマごとの候補 */
export type FrameCands = {
  wx: number;
  wy: number;
  body: number;
  /** 前腕（肘の中点→手首の中点）の向き。度。取れなければ null */
  armAng: number | null;
  list: (ShaftHit & { x: number; y: number })[];
};

/** 角度差を -180〜180 に畳む */
const angDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/**
 * 前腕とシャフトのなす角（手首のコック）の限界。
 *
 * 実測（2026-08-28・ユーザーのスイング動画で確認）:
 *   アドレス〜テークバックでは **シャフトは前腕の向きから ±10度** に収まっていた。
 *   スイング中は手首が折れて開くが、解剖学的にここを超えることはない。
 *   ＝これを超える候補は、体の輪郭やシミュレーター画面を拾った誤検出。
 */
const MAX_COCK = 120;

/**
 * コマごとの候補から軌跡を1本選ぶ（動的計画法）。
 *
 * なぜ「そのコマで一番強い向き」を選んではいけないか:
 *   シミュレーターの画面・体の輪郭・ネットなど、強く動くものはクラブ以外にもある。
 *   1コマだけ見れば互角でも、**クラブは前のコマの続きになっている**という条件を入れると一意に決まる。
 *
 * 距離の条件も効く: クラブは伸び縮みしないので、手元からヘッドまでの距離は
 * （カメラ方向を向いて短く写るぶんを除けば）体の大きさに対してほぼ一定。
 */
export function buildClub(
  frames: FrameCands[],
  t: number[],
  cw: number,
  ch: number
): { club: ClubData | null; kept: number; ratio: number } {
  // 前腕から見て有り得ない向きの候補は、ここで落とす。
  // 「画面の反対側を向いた強い動き」（シミュレーターの画面・ネット・体の輪郭）が
  // これでほぼ消える＝1コマだけ見れば互角だった競争が一気に決まる。
  const strong = frames.map((f) =>
    f.list.filter(
      (c) => c.norm >= CLUB_GATE && (f.armAng == null || Math.abs(angDiff(c.ang, f.armAng)) <= MAX_COCK)
    )
  );
  const kept = strong.filter((l) => l.length).length;
  if (kept < 6) return { club: null, kept, ratio: 0 };

  // クラブ長は体の大きさとの比で持つ（コマごとに体の写る大きさが変わるため）
  const ratios: number[] = [];
  strong.forEach((l, i) => { if (l.length && frames[i].body > 20) ratios.push(l[0].r / frames[i].body); });
  const ratio = Math.max(0.7, Math.min(1.05, percentile(ratios, 0.7) || 0.9));

  const GAPF = 8;   // 何コマまで飛び越えてつなぐか
  const cock = (i: number, c: ShaftHit) => (frames[i].armAng == null ? null : angDiff(c.ang, frames[i].armAng as number));
  const best: number[][] = strong.map((l) => l.map(() => -1e9));
  const from: ([number, number] | null)[][] = strong.map((l) => l.map(() => null));
  const value = (c: ShaftHit, body: number) => {
    const exp = Math.max(1, body * ratio);
    return Math.min(1.5, c.norm) * 2 + Math.min(1, c.fill / 0.8) - Math.abs(c.r - exp) / exp;
  };

  for (let i = 0; i < strong.length; i++) {
    for (let k = 0; k < strong[i].length; k++) {
      const c = strong[i][k];
      const ck = cock(i, c);
      let b = value(c, frames[i].body);
      let f: [number, number] | null = null;
      for (let g = 1; g <= GAPF && i - g >= 0; g++) {
        const j = i - g;
        for (let m = 0; m < strong[j].length; m++) {
          if (best[j][m] < -1e8) continue;
          const pv = strong[j][m];
          const speed = Math.hypot(c.x - pv.x, c.y - pv.y) / g;
          let pen = 2 * Math.pow(speed / Math.max(1, frames[i].body * 0.5), 2) + 0.25 * (g - 1);
          // 手首のコックはなめらかにしか変わらない。前腕から見た角度が
          // 1コマで飛ぶ組み合わせは、どちらかが誤検出。
          const pk = cock(j, pv);
          if (ck != null && pk != null) pen += 1.2 * Math.pow(Math.abs(angDiff(ck, pk)) / (25 * g), 2);
          const sc = best[j][m] + value(c, frames[i].body) - pen;
          if (sc > b) { b = sc; f = [j, m]; }
        }
      }
      best[i][k] = b;
      from[i][k] = f;
    }
  }

  let bi = -1;
  let bk = -1;
  let bv = -1e9;
  for (let i = 0; i < strong.length; i++) {
    for (let k = 0; k < strong[i].length; k++) if (best[i][k] > bv) { bv = best[i][k]; bi = i; bk = k; }
  }
  if (bi < 0) return { club: null, kept, ratio };

  const path: ((ShaftHit & { x: number; y: number }) | null)[] = new Array(strong.length).fill(null);
  let cur: [number, number] | null = [bi, bk];
  while (cur) { path[cur[0]] = strong[cur[0]][cur[1]]; cur = from[cur[0]][cur[1]]; }

  const chosen = path.filter(Boolean).length;
  if (chosen < 6) return { club: null, kept, ratio };

  const p: number[][] = path.map((c) =>
    c ? [Math.round((c.x / cw) * 1000), Math.round((c.y / ch) * 1000), Math.round(c.conf * 100)] : []
  );

  // --- 取れなかったコマを前腕から埋める（推定・conf は負で持つ） ---
  // クラブは前腕に対してなめらかにしか動かないので、前後の確かなコマの
  // 「前腕から見た角度」を線形につないで補う。**外挿はしない**（両端と長い空白は埋めない）。
  // 実測と推定は必ず区別して持つ（画面でも線の色を変える）。滑らかにつないで嘘をつかないため。
  const anchors: number[] = [];
  path.forEach((c, i) => { if (c && cock(i, c) != null) anchors.push(i); });
  for (let a = 0; a < anchors.length - 1; a++) {
    const i0 = anchors[a];
    const i1 = anchors[a + 1];
    if (i1 - i0 < 2 || i1 - i0 > 10) continue;
    const c0 = cock(i0, path[i0] as ShaftHit) as number;
    const c1 = cock(i1, path[i1] as ShaftHit) as number;
    // コックが10コマ以内で60度以上変わることはない。それだけ違うなら
    // 両端のどちらかが誤検出なので、間を埋めない（無い方がまし）
    if (Math.abs(angDiff(c1, c0)) > 60) continue;
    const r0 = (path[i0] as ShaftHit).r;
    const r1 = (path[i1] as ShaftHit).r;
    for (let i = i0 + 1; i < i1; i++) {
      const f = frames[i];
      if (f.armAng == null || !(f.body > 20)) continue;
      const w = (i - i0) / (i1 - i0);
      const ang = (f.armAng as number) + c0 + angDiff(c1, c0) * w;
      const r = r0 + (r1 - r0) * w;
      const x = f.wx + Math.cos((ang * Math.PI) / 180) * r;
      const y = f.wy + Math.sin((ang * Math.PI) / 180) * r;
      p[i] = [Math.round((x / cw) * 1000), Math.round((y / ch) * 1000), -1];  // 負＝推定
    }
  }

  const bodyMed = percentile(frames.filter((_, i) => p[i].length).map((f) => f.body), 0.5) || 1;
  return { club: { v: 1, t, p, clubLen: Math.round(((bodyMed * ratio) / cw) * 1000) }, kept, ratio };
}

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

    // クラブ検出の作業領域。
    // 直近 MAX_REF_GAP コマぶんを持っておく（毎コマ確保しない）。
    // なぜ1コマ前だけでは足りないか: スロー撮影だとコマ間でクラブがほとんど動かず、
    // 差分にシャフトが出ない。実機のスロー動画がまさにこれで、1コマ前だと何も取れなかった。
    const ring: Uint8Array[] = Array.from({ length: MAX_REF_GAP + 1 }, () => new Uint8Array(cw * ch));
    const ringAt = (n: number) => ring[((n % ring.length) + ring.length) % ring.length];
    const frameCands: FrameCands[] = [];
    // 検出がどこで落ちたかを数えておく
    let withPose = 0;
    let withRay = 0;
    const thrs: number[] = [];
    const fills: number[] = [];
    const confs: number[] = [];
    const gaps: number[] = [];

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
      const gCur = ringAt(i);
      const img = ctx.getImageData(0, 0, cw, ch).data;
      for (let j = 0, k = 0; j < gCur.length; j++, k += 4) {
        gCur[j] = (img[k] * 77 + img[k + 1] * 151 + img[k + 2] * 28) >> 8;
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

      // クラブ: 骨格から手首と体の大きさが取れたときだけ
      const cands: FrameCands = { wx: 0, wy: 0, body: 0, armAng: null, list: [] };
      if (i > 0 && one && one.length >= 33) {
        withPose++;
        const wx = ((one[LM.lWrist].x + one[LM.rWrist].x) / 2) * cw;
        const wy = ((one[LM.lWrist].y + one[LM.rWrist].y) / 2) * ch;
        const smx = ((one[LM.lShoulder].x + one[LM.rShoulder].x) / 2) * cw;
        const smy = ((one[LM.lShoulder].y + one[LM.rShoulder].y) / 2) * ch;
        const amx = ((one[LM.lAnkle].x + one[LM.rAnkle].x) / 2) * cw;
        const amy = ((one[LM.lAnkle].y + one[LM.rAnkle].y) / 2) * ch;
        // 肩〜足首を体の物差しにする。クラブはその 0.7〜1.0 倍（7I〜DR）
        let body = Math.hypot(amx - smx, amy - smy);
        if (!(body > 20)) {
          const sw = Math.hypot(
            (one[LM.rShoulder].x - one[LM.lShoulder].x) * cw,
            (one[LM.rShoulder].y - one[LM.lShoulder].y) * ch
          );
          body = sw * 3.2;
        }
        cands.wx = wx;
        cands.wy = wy;
        cands.body = body;
        // 前腕の向き。シャフトは前腕から大きくは外れない（実測±10度＠アドレス）ので、
        // 候補の絞り込みと、取れなかったコマの推定に使う
        const ex = ((one[LM.lElbow].x + one[LM.rElbow].x) / 2) * cw;
        const ey = ((one[LM.lElbow].y + one[LM.rElbow].y) / 2) * ch;
        cands.armAng = Math.hypot(wx - ex, wy - ey) > 5 ? (Math.atan2(wy - ey, wx - ex) * 180) / Math.PI : null;

        // 何コマ前と比べるかは決め打ちにしない。実際にシャフトがきれいに出た最小の間隔を採る。
        // （手元の動きから推定する案は、骨格の点のブレ数pxを動きと誤認して外れる）
        let bestNorm = -1;
        for (const g of REF_GAPS) {
          if (i - g < 0) break;
          const ref = ringAt(i - g);
          const th = motionThreshold(ref, gCur, cw, ch);
          const got = scanShaftCandidates(ref, gCur, cw, ch, wx, wy, body * 0.95, th);
          const nm = got.length ? got[0].norm : 0;
          if (nm > bestNorm) {
            bestNorm = nm;
            cands.list = got.map((c) => ({
              ...c,
              x: wx + Math.cos((c.ang * Math.PI) / 180) * c.r,
              y: wy + Math.sin((c.ang * Math.PI) / 180) * c.r,
            }));
            if (got.length) { thrs[i] = th; gaps[i] = g; }
          }
          if (nm >= CLUB_GOOD) break;
        }
        if (cands.list.length) {
          withRay++;
          fills.push(cands.list[0].fill);
          confs.push(cands.list[0].conf);
        }
      }
      frameCands.push(cands);

      t.push(ts);
      p.push(row);

      if (i % 5 === 0) {
        opts.onProgress?.(i + 1, total, "解析中");
        await wait(0); // UIを固まらせない
      }
    }

    opts.onProgress?.(total, total, "解析中");

    const built = buildClub(frameCands, t, cw, ch);
    const club = built.club;
    const plane = club ? planeFromAddress({ v: 1, t, p }, club, W, H) : null;
    const diag: ClubDiag = {
      frames: total,
      withPose,
      withRay,
      kept: built.kept,
      final: club ? club.p.filter((r) => r.length === 3).length : 0,
      thr: Math.round(percentile(thrs.filter((n) => n != null), 0.5)),
      fill: Math.round(percentile(fills, 0.5) * 100),
      conf: Math.round(percentile(confs, 0.5) * 100),
      gap: Math.round(percentile(gaps.filter((n) => n != null), 0.5)),
    };

    return {
      engine, fps, srcFps, width: W, height: H, frames: total, detected,
      data: { v: 1, t, p }, club, plane, diag,
    };
  } finally {
    video.src = "";
    revoke();
  }
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
  opts: { color?: string; showAll?: boolean; tailMs?: number } = {}
) {
  const { ox, oy, dw, dh } = box;
  const color = opts.color ?? "#ff9f1c";
  const upto = opts.showAll ? Infinity : sec * 1000 + 1;
  // 尾の長さ。動画が長いと最初から全部描いてしまい、線がぐちゃぐちゃになって読めない。
  // 再生に合わせてヘッドの後ろだけ引く（コーチが見たいのはいま通った軌跡）。
  const from = opts.showAll ? -Infinity : upto - (opts.tailMs ?? 2000);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const lw = Math.max(2, dw / 220);

  let prev: [number, number, number] | null = null;
  for (let i = 0; i < club.p.length; i++) {
    if (club.t[i] > upto) break;
    if (club.t[i] < from) { prev = null; continue; }
    const r = club.p[i];
    if (r.length !== 3) { prev = null; continue; }
    const x = ox + (r[0] / 1000) * dw;
    const y = oy + (r[1] / 1000) * dh;
    const c = r[2] / 100;
    if (prev) {
      // 実測はオレンジの実線、推定（前腕から補ったコマ）は青の点線。
      // 見た目で必ず区別できるようにする＝滑らかにつないで嘘をつかない
      const est = c < 0 || prev[2] < 0;
      ctx.setLineDash(est ? [lw * 2.5, lw * 2.5] : []);
      ctx.globalAlpha = est ? 0.7 : Math.max(0.15, Math.min(1, (c + prev[2]) / 2));
      ctx.strokeStyle = est ? "#8aa6ff" : color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(prev[0], prev[1]);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    prev = [x, y, c];
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  // いまのコマのヘッド
  const now = clubAt(club, sec);
  if (now && (now.conf >= 0.2 || now.conf < 0)) {
    const x = ox + now.x * dw;
    const y = oy + now.y * dh;
    ctx.fillStyle = now.conf < 0 ? "#8aa6ff" : color;
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

/**
 * 撮影方向と写り具合（2026-08-28）
 *
 * なぜ要るか:
 *   角度の数字は「同じ生徒の前回との差」で読むもの。三脚を毎回据えるのは現場で続かない
 *   （ユーザー判断・2026-08-28）ので、代わりに **今回どの向き・どの大きさで撮れたか** を数字で出し、
 *   前回と近いかどうかをコーチが目で確かめられるようにする。
 *
 * 求め方:
 *   アドレスでは肩のラインは飛球線と直角。
 *   後方（DTL）から見ると肩のラインはカメラを向いて短く写り、正面から見ると目一杯broadsideに写る。
 *   よって「肩幅 ÷ 肩〜足首」の比がそのまま撮影方向の目安になる（正面でおよそ0.30）。
 *   ⚠ カメラの高さや姿勢でも多少変わるので、あくまで目安。前回と比べるための物差しとして使う。
 */
export type ViewPoint = {
  /** 0=後方（DTL） … 90=正面 */
  deg: number;
  label: "後方" | "斜め" | "正面";
  /** 体（肩〜足首）が画面の高さの何%を占めているか。撮影距離の目安 */
  fill: number;
};

export function viewPoint(lm: Landmarks, W: number, H: number): ViewPoint | null {
  const X = (i: number) => lm[i].x * W;
  const Y = (i: number) => lm[i].y * H;
  const sw = Math.hypot(X(LM.rShoulder) - X(LM.lShoulder), Y(LM.rShoulder) - Y(LM.lShoulder));
  const smx = (X(LM.lShoulder) + X(LM.rShoulder)) / 2;
  const smy = (Y(LM.lShoulder) + Y(LM.rShoulder)) / 2;
  const amx = (X(LM.lAnkle) + X(LM.rAnkle)) / 2;
  const amy = (Y(LM.lAnkle) + Y(LM.rAnkle)) / 2;
  const body = Math.hypot(amx - smx, amy - smy);
  if (!(body > 20)) return null;
  const FACE_ON = 0.3; // 正面から見たときの 肩幅÷肩〜足首 のおおよその値
  const deg = (Math.asin(Math.max(0, Math.min(1, sw / body / FACE_ON))) * 180) / Math.PI;
  return {
    deg: Math.round(deg),
    label: deg < 30 ? "後方" : deg < 60 ? "斜め" : "正面",
    fill: Math.round((body / H) * 100),
  };
}

/** アドレス時の頭の位置からのブレ。肩幅を100%として何%動いたか */
export function headSway(base: PoseMetrics, now: PoseMetrics) {
  return {
    x: Math.round(((now.head.x - base.head.x) / base.shoulderWidth) * 100),
    y: Math.round(((now.head.y - base.head.y) / base.shoulderWidth) * 100),
  };
}
