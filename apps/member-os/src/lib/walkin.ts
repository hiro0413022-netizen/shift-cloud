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
