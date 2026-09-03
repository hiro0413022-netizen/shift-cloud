/**
 * トラックマン計測の項目定義（2026-08-22 ユーザー依頼）
 *
 * 使い方: コーチがトラックマンの「1ショットの詳細（数値タイル）」をスマホで撮る
 *   → AIが数値を読む（trackman-ai.ts）→ この定義で作ったフォームに載る
 *   → 人が見て直す → lsn_measurements に確定保存
 *
 * 設計の要点:
 *  - AIの読み取りは必ず人が確認する前提。confirmed_at が入って初めて「確定値」。
 *    AIの生結果は ai_raw に別で残すので、あとから読取精度を検証できる。
 *  - 単位は端末設定で変わる（m/s ⇄ mph、yd ⇄ m）。写真に写っている単位を
 *    そのまま `_units` に持ち、勝手に換算しない（換算は事故のもと）。
 *  - 読めなかった項目は空のまま。推測で埋めない。
 */

export type TmField = {
  key: string;
  label: string;
  /** 端末設定で変わりうる単位は候補を並べる。先頭が既定表示 */
  unit: string;
  group: "club" | "ball" | "flight";
};

export const TRACKMAN_FIELDS: TmField[] = [
  // クラブデータ
  { key: "club_speed", label: "クラブスピード", unit: "m/s", group: "club" },
  { key: "attack_angle", label: "アタックアングル", unit: "°", group: "club" },
  { key: "club_path", label: "クラブパス", unit: "°", group: "club" },
  { key: "face_angle", label: "フェースアングル", unit: "°", group: "club" },
  { key: "face_to_path", label: "フェーストゥパス", unit: "°", group: "club" },
  { key: "dynamic_loft", label: "ダイナミックロフト", unit: "°", group: "club" },
  { key: "spin_loft", label: "スピンロフト", unit: "°", group: "club" },
  { key: "swing_plane", label: "スイングプレーン", unit: "°", group: "club" },
  { key: "swing_direction", label: "スイングディレクション", unit: "°", group: "club" },
  { key: "low_point", label: "ローポイント", unit: "cm", group: "club" },
  // ボールデータ
  { key: "ball_speed", label: "ボールスピード", unit: "m/s", group: "ball" },
  { key: "smash_factor", label: "ミート率", unit: "", group: "ball" },
  { key: "launch_angle", label: "打ち出し角", unit: "°", group: "ball" },
  { key: "launch_direction", label: "打ち出し方向", unit: "°", group: "ball" },
  { key: "spin_rate", label: "スピン量", unit: "rpm", group: "ball" },
  { key: "spin_axis", label: "スピン軸", unit: "°", group: "ball" },
  // 弾道
  { key: "carry", label: "キャリー", unit: "yd", group: "flight" },
  { key: "total", label: "トータル", unit: "yd", group: "flight" },
  { key: "side", label: "サイド（着地の左右）", unit: "yd", group: "flight" },
  { key: "height", label: "最高到達点", unit: "yd", group: "flight" },
  { key: "land_angle", label: "落下角", unit: "°", group: "flight" },
  { key: "hang_time", label: "滞空時間", unit: "s", group: "flight" },
];

export const TM_GROUP_LABEL: Record<TmField["group"], string> = {
  club: "クラブデータ",
  ball: "ボールデータ",
  flight: "弾道",
};

export const TM_KEYS = new Set(TRACKMAN_FIELDS.map((f) => f.key));

/**
 * お客様の画面に出す項目は **@yozan/core/lesson-share が正典**（2026-09-03・#210）。
 * 会員ページ（member-os）と共有ページ（lesson-os）の2か所で同じものを描くので、
 * どちらかに書くと「会員ページには出るのに共有URLには出ない」が起きる。
 */
export { CLIENT_FIELDS, CLIENT_FIELD_KEYS } from "@yozan/core/lesson-share";

/** 計測値（確定値）。`_units` は写真に写っていた単位をそのまま持つ */
export type TrackmanValues = Record<string, number> & { _units?: Record<string, string> };

/** 文字列・数値・全角数字を数値へ。読めなければ undefined（0にはしない） */
export function toNum(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const z = v
    .trim()
    .replace(/[０-９．＋－]/g, (c) => "0123456789.+-"["０１２３４５６７８９．＋－".indexOf(c)])
    .replace(/[^0-9.+-]/g, "");
  if (!z || z === "-" || z === "+" || z === ".") return undefined;
  const n = Number(z);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * DBに入れる前の正規化。既知のキーだけ・数値だけ通す。
 * 桁が明らかに異常な値（スピン量10万rpm等）はAIの誤読なので落とす。
 */
const RANGE: Record<string, [number, number]> = {
  club_speed: [1, 200],
  ball_speed: [1, 300],
  smash_factor: [0.5, 2],
  spin_rate: [0, 20000],
  carry: [0, 500],
  total: [0, 600],
  height: [0, 200],
  hang_time: [0, 20],
  low_point: [-50, 50],
};

export function sanitizeTrackman(input: unknown): TrackmanValues {
  const src = (input ?? {}) as Record<string, unknown>;
  const out: TrackmanValues = {};
  for (const f of TRACKMAN_FIELDS) {
    const n = toNum(src[f.key]);
    if (n === undefined) continue;
    const r = RANGE[f.key];
    if (r && (n < r[0] || n > r[1])) continue;
    out[f.key] = Math.round(n * 100) / 100;
  }
  const units = src._units;
  if (units && typeof units === "object") {
    const u: Record<string, string> = {};
    for (const [k, v] of Object.entries(units as Record<string, unknown>)) {
      if (TM_KEYS.has(k) && typeof v === "string" && v.length <= 8) u[k] = v;
    }
    if (Object.keys(u).length) out._units = u;
  }
  return out;
}

/** 一覧に出す要約（キャリー・ボールスピード・スピン量あたりが実務で一番見られる） */
export function summarize(v: TrackmanValues): string {
  const u = v._units ?? {};
  const parts: string[] = [];
  const push = (key: string, label: string, fallbackUnit: string) => {
    const n = v[key];
    if (typeof n === "number") parts.push(`${label} ${n}${u[key] ?? fallbackUnit}`);
  };
  push("carry", "キャリー", "yd");
  push("ball_speed", "ボール", "m/s");
  push("spin_rate", "スピン", "rpm");
  push("launch_angle", "打出", "°");
  return parts.join(" ／ ") || "（数値なし）";
}
