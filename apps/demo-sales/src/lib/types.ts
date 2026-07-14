// AI DEMO SALES — 共有型・定数

export const INDUSTRIES = {
  naika: "内科",
  dental: "歯科",
  ortho: "整形外科",
  pediatrics: "小児科",
  derma: "皮膚科",
  eye: "眼科",
  ent: "耳鼻咽喉科",
  beauty: "美容クリニック",
  vet: "動物病院",
  judo: "接骨院・整骨院",
  other: "その他",
} as const;
export type IndustryKey = keyof typeof INDUSTRIES;

// 営業ステータス（順番=ファネル順）
export const STATUSES = {
  candidate: "候補",
  unanalyzed: "未分析",
  analyzing: "分析中",
  analyzed: "分析完了",
  demo_candidate: "デモ作成候補",
  demo_in_progress: "デモ作成中",
  demo_done: "デモ完成",
  ready: "営業準備完了",
  uncontacted: "未連絡",
  contacted: "初回連絡済み",
  reception: "受付対応",
  contact_confirming: "担当者確認中",
  scheduling: "面談日程調整中",
  meeting_set: "面談予定",
  met: "面談完了",
  demo_revising: "修正デモ作成中",
  quoting: "見積作成中",
  quoted: "見積提出",
  considering: "院内検討中",
  recontact: "再連絡予定",
  won: "成約",
  lost: "失注",
  hold: "保留",
  unreachable: "連絡不可",
  transferred: "正式制作へ移行",
} as const;
export type StatusKey = keyof typeof STATUSES;

export const LOST_REASONS = [
  "現在の制作会社との契約が残っている",
  "予算がない",
  "現在のサイトで満足",
  "院内で更新する予定",
  "院長が関心を持たなかった",
  "担当者につながらなかった",
  "時期が悪い",
  "デモが希望と合わなかった",
  "料金が高い",
  "月額費用への抵抗",
  "他社を選んだ",
  "連絡が取れなくなった",
] as const;

// デモ生成の入力（=dms_demos.brief）。空欄はテンプレートの仮データ（※仮ラベル付き）で補完される
export interface DemoBrief {
  clinicName: string;
  industry: IndustryKey;
  tagline?: string; // キャッチコピー
  intro?: string; // 導入文（院長の考え方・患者/飼い主へのメッセージ）
  colorPrimary?: string; // 基調色の上書き（例: #2f7a4f）
  phone?: string;
  address?: string;
  access?: string; // 最寄り駅・バス等
  parking?: string; // 駐車場案内
  hoursRows?: string[][]; // 診療時間表。1行目=ヘッダ（例: ["診療時間","月","火",...]）
  hoursNote?: string; // 休診日等の注記
  services?: { name: string; desc: string }[];
  strengths?: string[]; // 医院の強み（現サイトの魅力を活かす）
  firstVisit?: string[]; // 初診案内（持ち物・流れ）
  reserveNote?: string; // 予約方法（電話中心/Web予約あり等）
  webReserve?: boolean; // Web予約導線を見せるか
  directorTitle?: string; // 院長 等
  directorName?: string;
  directorMessage?: string;
  news?: { date: string; text: string }[];
  recruit?: string; // 採用メッセージ（空なら入口のみ）
  instructions?: string[]; // 修正指示の履歴（面談中の要望等）
}

// 分析（=dms_prospects.analysis）。各項目 1-5（5が良い）＋所見
export const ANALYSIS_ITEMS = {
  mobile: "スマートフォン対応",
  design: "デザインの新しさ",
  updated: "更新状況（最終更新・お知らせ）",
  hours: "診療時間の見やすさ",
  cta: "予約・電話導線",
  first_visit: "初診患者向け案内",
  staff: "院長・スタッフ紹介",
  access: "アクセス・駐車場情報",
  speed: "ページ表示速度",
  ssl: "SSL対応",
  recruit: "採用情報",
  gmap: "Googleマップとの整合性",
  trust: "サイト全体の安心感",
  photos: "写真の品質",
  volume: "競合と比較した情報量",
} as const;
export type AnalysisItemKey = keyof typeof ANALYSIS_ITEMS;

export interface Analysis {
  items?: Partial<Record<AnalysisItemKey, { score?: number; note?: string }>>;
  summary?: string; // 総評
  effect?: string; // HP改善による効果の見込み
  scale?: string; // 事業規模の所感
  budget?: string; // 予算確保の可能性
}
