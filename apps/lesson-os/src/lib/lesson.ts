/**
 * Lesson OS 共通定義（DECISIONS #50 / PGA NOTE準拠）
 * 基本情報・詳細情報はJSONB（lsn_students.profile / .skill）に保存し、フィールド定義はここが正典。
 */

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: string[];
  unit?: string;
};

/** 基本情報（PGA NOTEの「顔写真付きの基本情報登録」相当） */
export const PROFILE_FIELDS: FieldDef[] = [
  { key: "birth_date", label: "生年月日", type: "date" },
  { key: "gender", label: "性別", type: "select", options: ["男性", "女性", "その他"] },
  { key: "height_cm", label: "身長", type: "number", unit: "cm" },
  { key: "grip_left", label: "握力（左）", type: "number", unit: "kg" },
  { key: "grip_right", label: "握力（右）", type: "number", unit: "kg" },
  { key: "handedness", label: "利き手", type: "select", options: ["右利き", "左利き"] },
  { key: "style1", label: "学習スタイル1", type: "select", options: ["行動型", "感覚型", "観察型", "思案型"] },
  { key: "style2", label: "学習スタイル2", type: "select", options: ["行動型", "感覚型", "観察型", "思案型"] },
  { key: "reason", label: "受講理由", type: "text" },
];

/** 詳細情報（PGA NOTEの「ゴルフのスキル情報」相当） */
export const SKILL_FIELDS: FieldDef[] = [
  { key: "head_speed", label: "ヘッドスピード", type: "number", unit: "m/s" },
  { key: "distance", label: "飛距離", type: "number", unit: "yd" },
  { key: "ball_flight", label: "球筋", type: "select", options: ["ストレート", "ドロー", "フェード", "スライス", "フック", "プッシュ", "プル"] },
  { key: "best_score", label: "ベストスコア", type: "number" },
  { key: "avg_score", label: "平均スコア/HDCP", type: "number" },
  { key: "rounds_year", label: "年間ラウンド数", type: "number", unit: "回" },
  { key: "fav_club", label: "得意クラブ", type: "text" },
  { key: "golf_years", label: "ゴルフ歴", type: "text" },
  { key: "sports", label: "スポーツ歴", type: "text" },
  { key: "home_course", label: "ホームコース", type: "text" },
];

/** クラブ選択肢 */
export const CLUBS = ["DR", "3W", "5W", "UT", "3I", "4I", "5I", "6I", "7I", "8I", "9I", "PW", "AW", "SW", "PT"];

/** 動画描画の形状（annotations.shapes） */
export type Shape =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; c: string }
  | { t: "circle"; cx: number; cy: number; r: number; c: string }
  | { t: "free"; pts: [number, number][]; c: string };

export type Annotations = { shapes: Shape[] };
