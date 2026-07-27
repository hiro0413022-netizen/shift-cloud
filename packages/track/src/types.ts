/**
 * @yozan/track — トークン付きURLの閲覧計測（migration 0085 / DECISIONS #95）
 *
 * 「配った成果物を相手が見たか」をアプリ横断で測る。
 * demo-sales の営業デモが第一号だが、reserve-os の予約リンク・survey-os のアンケート・
 * report-os の月次資料など、トークン付きURLで配るものなら何でも同じ仕組みに乗る。
 *
 * 使い方（3ステップ）:
 *   1. 配信時に registerLink() でリンクを登録（既存トークンをそのまま渡す）
 *   2. 配信するHTMLに injectTracking() でビーコンを差し込む
 *   3. アプリに createTrackHandler() のPOSTルートを1本生やす（middlewareの公開パスに追加）
 */

/** 計測イベントの種類。heartbeat は保存されず滞在秒に畳まれる */
export type TrackKind = "open" | "page" | "click" | "heartbeat";

/** 配布リンク1本（trk_links） */
export type TrackLink = {
  id: string;
  companyId: string;
  app: string;
  resourceType: string;
  resourceId: string;
  token: string;
  label: string | null;
  href: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  /** 社外セッション数（社内プレビューは除外） */
  viewCount: number;
  /** 社外の合計滞在秒 */
  totalSeconds: number;
  notifiedAt: string | null;
};

/** 閲覧1回（trk_sessions） */
export type TrackSession = {
  id: string;
  linkId: string;
  isInternal: boolean;
  startedAt: string;
  lastSeenAt: string;
  seconds: number;
  pageViews: number;
  pages: string[];
  firstPage: string | null;
  referrer: string | null;
  device: string | null;
};

export type RegisterLinkInput = {
  companyId: string;
  /** 呼び出し元アプリ（'demo-sales' 等） */
  app: string;
  /** 資源の種別（'demo' / 'quote' / 'report' 等） */
  resourceType: string;
  /** 元テーブルの主キー */
  resourceId: string;
  /** 配信URLのトークン（アプリ側の既存トークンをそのまま） */
  token: string;
  /** 一覧表示用のラベル（営業先名など） */
  label?: string | null;
  /** 管理画面から元レコードへ戻る導線 */
  href?: string | null;
};

export type RecordInput = {
  token: string;
  sessionKey: string;
  kind: TrackKind;
  page?: string | null;
  label?: string | null;
  seconds?: number;
  /** 社内プレビュー（営業担当が自分で開いた分）＝集計から除外 */
  internal?: boolean;
  meta?: { referrer?: string | null; ua?: string | null; device?: string | null };
};

export type RecordResult = { ok: boolean; first?: boolean; internal?: boolean; reason?: string };

/** 最小限の Supabase クライアント面（@yozan/core/supabase/admin の createAdmin() を渡す） */
export type AdminClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
