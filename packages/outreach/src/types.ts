// @yozan/outreach — 共有型

export interface OutSettings {
  company_id: string;
  enabled: boolean;
  from_email: string | null;
  from_name: string;
  reply_to: string | null;
  daily_cap_max: number;
  warmup_start: string | null; // YYYY-MM-DD
  send_hour_jst: number;
  paused_at: string | null;
  paused_reason: string | null;
}

/** 送信判定に必要な営業先の情報だけを写したもの（DBの行そのものではない＝純粋関数に渡せる） */
export interface SendCandidate {
  id: string;
  name: string;
  industry: string;
  email: string | null;
  emailSource: string | null; // site / directory / places / manual
  score: number | null;
  noSolicit: boolean;
  status: string;
  hasDemo: boolean;
  alreadySent: boolean;
}

export type SkipReason =
  | "no_email"
  | "email_not_public" // サイトで公表を確認できていない＝法的根拠が無い
  | "no_solicit" // 「営業お断り」表示
  | "suppressed" // 配信停止・バウンス・苦情
  | "already_sent"
  | "no_demo" // 見せるものが無い状態で送らない
  | "low_score"
  | "daily_cap"
  | "disabled" // 送信そのものがOFF
  | "paused"; // 自動停止中

export interface SendDecision {
  ok: boolean;
  reason?: SkipReason;
  note?: string;
}

export interface CompanyIdentity {
  companyName: string;
  representative: string;
  postalCode: string;
  address: string;
}

export interface TemplateRow {
  key: string;
  industry: string | null;
  subject: string;
  body: string;
  enabled: boolean;
  sort: number;
}

export interface ComposedEmail {
  subject: string;
  text: string;
  html: string;
}
