// @yozan/prospect — 共有型
//
// このパッケージは「業種」を知らない。業種キー（naika/vet/beauty…）は利用側（demo-sales）の定義であり、
// ここでは文字列として素通しする。アプリ非依存にしておかないと他システムから使えない（[[hp-sales-pipeline]] の方針）。

/** 巡回で見つけた1件。まだ営業先ではない（重複・サイト無しはここで落ちる） */
export interface ProspectCandidate {
  /** 二度拾わないための鍵。詳細ページURL または places の place_id */
  refKey: string;
  name: string;
  industry: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  /**
   * 公式サイトの有無を**実際に調べたか**（#118）。
   * websiteUrl が null なだけでは「HPが無い」と断定できない。一覧ページしか見ていない名簿では
   * そもそも探していないからで、これを「HPなし95点＝最優先」にすると、
   * ホームページを持っている医院に「見当たりません」と営業することになる。
   * 既定は false（＝未確認）。安全側に倒すため、埋め忘れても嘘の最優先は生まれない。
   */
  websiteChecked?: boolean;
  gmapUrl?: string | null;
  /** 拾ってきた元ページ（出どころを辿れるように必ず入れる） */
  sourceUrl?: string | null;
}

/** 1ページ取得の観測結果。auditPage はこれだけを見る＝ネットワーク無しでテストできる */
export interface PageSnapshot {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  html: string;
  /** 取得にかかったミリ秒（表示速度の代理指標。PageSpeedが無いときのフォールバック） */
  elapsedMs: number;
  bytes: number;
}

/** 評価項目1つ。score は 1-5（5が良い）＝ dms_prospects.analysis.items と同じ形 */
export interface AuditItem {
  score: number;
  note: string;
}

export interface WebAudit {
  /** サイトが取得できたか。false のときは items が空で reason に理由が入る */
  ok: boolean;
  reason?: string;
  /** ANALYSIS_ITEMS のキー（mobile/ssl/speed/cta/updated/…）ごとの評価 */
  items: Record<string, AuditItem>;
  /** 営業有望度 0-100。「サイトの改善余地が大きく、連絡先も取れる」ほど高い */
  score: number;
  /** 弱点の要約（営業トークではなく事実の列挙）。good_points / improve_points に流す */
  goodPoints: string[];
  improvePoints: string[];
  /** 「営業メールお断り」等の表示。②outreach で送信除外に使う（特定電子メール法の運用） */
  noSolicit: boolean;
  /** 観測の生データ。所見(analysis)と違い、後から人が書き換えない */
  raw: Record<string, unknown>;
}

/** 取得アダプタ。kind を増やすときはここを実装するだけで server.ts は触らない */
export interface SourceAdapter {
  kind: string;
  /** 候補を列挙する。ネットワーク失敗は throw せず errors に積む（1つの巡回元の不調で全体を止めない） */
  collect(source: SourceRow, ctx: AdapterContext): Promise<{ candidates: ProspectCandidate[]; errors: string[] }>;
}

export interface AdapterContext {
  /** 1回の巡回で取りに行く上限。外部サイトへの負荷と実行時間の両方を抑える */
  limit: number;
  /** 既に見た refKey（再訪しない） */
  seen: Set<string>;
  /** 秒あたりのアクセス間隔（ミリ秒） */
  delayMs: number;
  env: Record<string, string | undefined>;
}

export interface SourceRow {
  id: string;
  company_id: string;
  name: string;
  kind: string;
  industry: string;
  city: string | null;
  url: string | null;
  link_pattern: string | null;
  query: string | null;
  max_per_run: number;
  /** 詳細ページを開いて公式サイトURLを探すか（既定false＝一覧だけで拾う・#116） */
  visit_detail?: boolean;
  /** 一覧の読み取り方: auto=規則→ダメならAI / rules=規則のみ / ai=AIのみ（#117） */
  parser?: string;
}
