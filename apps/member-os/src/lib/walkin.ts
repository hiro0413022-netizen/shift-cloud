// 一時利用者名簿の選択肢マスタ・ラベル（DECISIONS #28 / WALKIN_LEDGER.md）
// フォームのドロップダウンとExcel出力・表示で共通利用する。

export const VISIT_TYPES = [
  { value: "trial", label: "体験利用" },
  { value: "fitting", label: "フィッティング" },
  { value: "bay", label: "打席利用" },
  { value: "visitor_bay", label: "ビジター打席" },
  { value: "other", label: "その他" },
] as const;
export type VisitType = (typeof VISIT_TYPES)[number]["value"];
export const VISIT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  VISIT_TYPES.map((v) => [v.value, v.label])
);

export const RESULTS = [
  { value: "none", label: "—" },
  { value: "join", label: "入会" },
  { value: "purchase", label: "購入" },
] as const;
export const RESULT_LABEL: Record<string, string> = Object.fromEntries(
  RESULTS.map((v) => [v.value, v.label])
);

export const PAYMENT_METHODS = [
  { value: "store", label: "店頭" },
  { value: "web", label: "WEB" },
  { value: "free_campaign", label: "無料キャンペーン" },
  { value: "other", label: "その他" },
] as const;
export const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((v) => [v.value, v.label])
);

export const GENDERS = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "other", label: "その他" },
  { value: "unknown", label: "無回答" },
] as const;
export const GENDER_LABEL: Record<string, string> = Object.fromEntries(
  GENDERS.map((v) => [v.value, v.label])
);

// お客様入力の選択肢
export const OCCUPATIONS = [
  "会社経営者・役員", "自営業", "公務員", "会社員", "専業主婦", "学生", "その他",
];
export const CONTACT_METHODS = ["電話", "ショートメール", "LINE", "メール"];
export const REFERRAL_SOURCES = [
  "知人の紹介", "ホームページ", "インターネット検索", "Instagram", "YouTube", "公式LINE",
  "TVのCM", "新聞・雑誌の広告", "チラシ", "通りがかり", "会員家族", "社長紹介", "ロータリー関連", "その他",
];
export const DISCOUNTS = ["なし", "公式LINE", "社長紹介", "ロータリー関連", "再来", "チラシ"];

// アンケート（利用区分により出し分け）
export const TRIAL_REASONS = [
  "天候に左右されない練習環境", "飛距離を伸ばすため", "シミュレーションシステムの活用",
  "トラックマン等計測設備の利用", "自宅が近いから", "会社が近いから", "PGAプロに習ってみたい",
  "パーソナルレッスン", "その他",
];
export const FITTING_REASONS = [
  "シャフトの種類の多さ", "シャフト試打", "トラックマン等計測設備の利用",
  "シミュレーションシステムの活用", "PGAプロの在籍", "JPDA認定トレーナー在籍", "その他",
];
export const SCHOOL_GOALS = [
  "今よりも飛距離を伸ばしたい", "スコアアップを目指したい",
  "ゴルフスイングの理論やテクニックに関する理解を深めたい", "定期的に体を動かしたい",
  "気軽に練習できる環境が欲しい", "コンペ対策", "その他",
];
export const JOIN_INTEREST = ["有", "無", "検討中"];

/* ============================================================
   体験カウンセリング（FRANK GOLF の紙シートを台帳に取り込む / 2026-09-02）

   紙の「FRANK GOLF 体験カウンセリングシート」をお客様に書いていただき、
   **スタッフが受付台帳の行に入力する**（お客様のタブレット入力欄は増やさない＝ユーザー指示）。

   重複は増やさない（ユーザー指示「重複を統合」）:
     ⑦ FRANK GOLFを知ったきっかけ → 既存の「何で知ったか」= mbr_walkin_visits.referral_source
     ⑧ 今日の体験で知りたいこと   → 既存の survey.comment（体験後のコメント欄と同じ器）
     スタッフ記入欄               → 既存の mbr_walkin_visits.note（備考・フォロー状況）
   なので新しく持つのは ①〜⑥ だけ。すべて survey(jsonb) の中に足す＝マイグレーション不要。
   ============================================================ */

export const GOLF_YEARS = ["未経験・始めたばかり", "1年未満", "1〜3年", "3〜10年", "10年以上"];
export const PRACTICE_FREQ = ["ほぼしない", "月1〜2回", "週1回", "週2回以上"];
export const ROUND_FREQ = ["ほぼしない", "月1回程度", "月2回以上"];
export const AVG_SCORES = ["120以上", "110台", "100台", "90台", "80台以下", "まだコースに出たことがない"];
export const IMPROVE_POINTS = [
  "ドライバー", "アイアン", "アプローチ", "飛距離アップ",
  "スライス・フックなど方向性", "スイングを基礎から整えたい", "スコアアップ", "その他",
];
export const CHOOSE_FACTORS = [
  "通いやすさ", "完全個室", "シミュレーター・設備", "レッスンを受けられる",
  "好きな時間に練習できる", "落ち着いて練習できる", "料金", "その他",
];
/** ⑤⑥は紙と同じく最大2つまで */
export const COUNSELING_MAX_PICK = 2;
