/**
 * システムネットワークマップのトポロジ定義（正典・DECISIONS #47）。
 * 新しいアプリ/システムを作ったら、必ずここにノードとエッジを追記し、
 * public/flows/ にフロー図SVGを追加すること。
 * vault_systems に登録されただけの未マッピングシステムは、画面側で自動的に
 * 点線ノードとして表示される（topology追記までの暫定表示）。
 */

export type NodeKind = "core" | "app" | "external" | "script";
export type NodeStatus = "prod" | "undeployed" | "migrating" | "script" | "external";

export type SystemNode = {
  id: string;
  name: string;
  kind: NodeKind;
  status: NodeStatus;
  /** 表示用URL */
  url?: string;
  /** 死活監視するURL（確認済みのもののみ設定） */
  healthUrl?: string;
  /** DBスキーマ接頭辞など */
  schema?: string;
  description: string;
  /** public/flows/ 配下のフロー図ファイル名 */
  flow?: string;
  /** vault_systems の name との突き合わせ用（小文字・空白除去で部分一致） */
  aliases: string[];
  /** 初期配置座標（ワールド座標 1200x820） */
  ix: number;
  iy: number;
};

export type EdgeType = "data" | "kpi" | "approval" | "external" | "auto";

export type SystemEdge = {
  from: string;
  to: string;
  label: string;
  type: EdgeType;
};

export const STATUS_LABEL: Record<NodeStatus, string> = {
  prod: "本番稼働",
  undeployed: "実装済・未デプロイ",
  migrating: "移行中",
  script: "スクリプト（監視対象外）",
  external: "外部データ源",
};

export const NODES: SystemNode[] = [
  {
    id: "supabase",
    name: "Supabase 共有DB",
    kind: "core",
    status: "prod",
    description:
      "単一プロジェクト（qrgpblnnhdudigarrtuz）。PostgreSQL + RLS(company_id) + Auth + Storage。全アプリがスキーマ接頭辞で同居し、書いた瞬間にGENESISから見える。",
    schema: "共通Kernel: audit_logs / approval_requests / notifications / kpis / vault_systems",
    flow: "map.svg",
    aliases: ["supabase"],
    ix: 600,
    iy: 380,
  },
  {
    id: "kernel",
    name: "自動集約",
    kind: "core",
    status: "prod",
    description:
      "各OSの実データを fin_entries（事業×科目×月）へ集約し、refresh_*_kpis が kpis を更新する層。保存時または夜間cronで自動実行。",
    schema: "fin_entries → refresh_finance_kpis / refresh_caddy_finance / refresh_shift_cloud_kpis → kpis",
    flow: "map.svg",
    aliases: [],
    ix: 600,
    iy: 560,
  },
  {
    id: "genesis",
    name: "GENESIS 司令室",
    kind: "app",
    status: "prod",
    url: "https://yozan-genesis.vercel.app",
    healthUrl: "https://yozan-genesis.vercel.app",
    schema: "fin_ / sec_ / vault_ ほか",
    description:
      "古川さん専用の司令室。Cockpit（5大KPI）・CEO AI秘書・Inbox承認・Finance・Vault。入力面を持たず、閲覧と承認だけを行う。",
    flow: "genesis-secretary.svg",
    aliases: ["genesis"],
    ix: 600,
    iy: 720,
  },
  {
    id: "shift-cloud",
    name: "Shift Cloud",
    kind: "app",
    status: "prod",
    url: "https://shift-cloud-shift-cloud.vercel.app",
    healthUrl: "https://shift-cloud-shift-cloud.vercel.app",
    schema: "無印（staff / shifts / 打刻 / payroll）",
    description:
      "シフト・勤怠・給与。希望提出→確定→iPad打刻→日次集計→月末照合→給与CSV。労務KPI（人件費・労働時間）を0008でkpisへ供給。",
    flow: "shift-cloud.svg",
    aliases: ["shift", "シフト", "勤怠"],
    ix: 250,
    iy: 200,
  },
  {
    id: "lesson-os",
    name: "Lesson OS",
    kind: "app",
    status: "prod",
    url: "https://lesson-os.vercel.app",
    healthUrl: "https://lesson-os.vercel.app",
    schema: "lsn_",
    description:
      "レッスンカルテ（WING NOTE代替）。スイング動画・コーチコメント・★ベストスイング。生徒はSmart Hello会員番号で会員名簿と疎結合。Trackman受け口（lsn_measurements）を装備。",
    flow: "lesson-os.svg",
    aliases: ["lesson", "レッスン", "wingnote", "wing note"],
    ix: 90,
    iy: 120,
  },
  {
    id: "member-os",
    name: "Member OS",
    kind: "app",
    status: "prod",
    url: "https://member-os-tau.vercel.app",
    healthUrl: "https://member-os-tau.vercel.app",
    schema: "mbr_",
    description:
      "体験受付・会員名簿・一時利用台帳。タブレット自己入力→台帳→【入会】でKPI反映。Smart Hello 3ファイルの/import取込が月次資料の土台。",
    flow: "member-os.svg",
    aliases: ["member", "体験受付", "会員"],
    ix: 430,
    iy: 130,
  },
  {
    id: "money-golfwing",
    name: "Money OS",
    kind: "app",
    status: "prod",
    url: "https://money-golfwing.vercel.app",
    healthUrl: "https://money-golfwing.vercel.app",
    schema: "mon_",
    description:
      "事業別お金管理（第1弾GOLF WING）。売上明細・現金出納・経費・金種の現場入力とAMEX/尼崎信金CSV取込。保存時にfin_entriesへ自動集計。",
    flow: "money-os.svg",
    aliases: ["money", "お金"],
    ix: 780,
    iy: 130,
  },
  {
    id: "legal-os",
    name: "Legal OS",
    kind: "app",
    status: "prod",
    url: "https://legal-os-peach.vercel.app",
    healthUrl: "https://legal-os-peach.vercel.app",
    schema: "leg_ + Storage(legal-docs)",
    description:
      "契約書・証憑の保管と期限管理。legal_aiが要点・リスク・期限を提案し、締結/更新/解約はapproval_requests経由で古川さんが承認。",
    flow: "legal-os.svg",
    aliases: ["legal", "契約", "法務"],
    ix: 950,
    iy: 250,
  },
  {
    id: "survey-os",
    name: "Survey OS",
    kind: "app",
    status: "undeployed",
    schema: "svy_",
    description:
      "アンケート/情報収集。匿名公開回答・ドラッグ順位付け・ボルダ+平均順位集計。GOLF WINGコーチ評価（golfwing-2026）投入済・未デプロイ。",
    flow: "survey-os.svg",
    aliases: ["survey", "アンケート"],
    ix: 990,
    iy: 430,
  },
  {
    id: "reserve-os",
    name: "Reserve OS",
    kind: "app",
    status: "prod",
    schema: "res_",
    description:
      "ビジター申込型予約（第1弾シャフトフィッティング）。候補日時3つ＋ヒアリング→申込がスタッフの「やること」(sp_tasks)に自動で積まれる→スタッフが日程確認しGOLF WINGのメールから返信→Reserve OSで確定。メール/LINE自動通知は次回。",
    flow: "reserve-os.svg",
    aliases: ["reserve", "予約"],
    ix: 930,
    iy: 610,
  },
  {
    id: "caddy-os",
    name: "Caddy OS",
    kind: "app",
    status: "undeployed",
    schema: "cad_",
    description:
      "キャディ派遣管理。1派遣=1行で売上と原価を持ち行単位の粗利が出る。社員行は原価0をCHECK制約で強制（交通費二重計上の防止）。272派遣移行済・未デプロイ。",
    flow: "caddy-os.svg",
    aliases: ["caddy", "キャディ"],
    ix: 210,
    iy: 430,
  },
  {
    id: "golfwing",
    name: "GolfOrder",
    kind: "app",
    status: "migrating",
    url: "https://shift-cloud-golfwing.vercel.app",
    healthUrl: "https://shift-cloud-golfwing.vercel.app",
    schema: "D1 → Supabase 移行中（#19）",
    description:
      "GOLF WINGの店頭注文・発注管理（Vite/Hono）。ワークスへの発注はメール→WebEDI CSV生成（実装済・商品コードマスタ待ちで未デプロイ）。",
    flow: "golfwing.svg",
    aliases: ["golforder", "発注"],
    ix: 270,
    iy: 620,
  },
  {
    id: "report-os",
    name: "Report OS",
    kind: "script",
    status: "script",
    schema: "読み取り: mbr_ / kpis / fin_entries",
    description:
      "事業所別の月次報告資料（.pptx 8枚）をJSON駆動で自動生成。数値は自動、文章はClaude APIが下書きし、古川さんは承認/修正だけ。",
    flow: "report-os.svg",
    aliases: ["report", "月次資料"],
    ix: 380,
    iy: 760,
  },
  {
    id: "sales-os",
    name: "Sales OS",
    kind: "app",
    status: "undeployed",
    schema: "sales_os（同居・別システム）",
    description:
      "PGA NOTE営業サポートSaaS（ファイン福原さん管理）。Excel3つを取込み「今日やること」を自動表示。GENESISとは別システム・将来接続。",
    flow: "sales-os.svg",
    aliases: ["sales", "営業", "pganote", "pga"],
    ix: 900,
    iy: 750,
  },
  {
    id: "demo-sales",
    name: "AI DEMO SALES",
    kind: "app",
    status: "undeployed",
    schema: "dms_",
    description:
      "クリニック・動物病院向けHP制作の営業デモ高速生成（WEB SALES COMMAND CENTER）。営業先ごとの専用デモ（/d/トークン・noindex）＋提案書・トーク・見積を自動生成。成約でdms_projectsへ移行（0048）。",
    flow: "demo-sales.svg",
    aliases: ["demo", "デモ営業", "web sales", "hp営業", "demo-sales"],
    ix: 900,
    iy: 900,
  },
  {
    id: "corporate",
    name: "YOZANコーポレート",
    kind: "app",
    status: "prod",
    schema: "DBなし（公開サイト）",
    description: "YOZANのコーポレートサイト。公開ページのみでDB接続なし。",
    aliases: ["corporate", "コーポレート", "yozanサイト"],
    ix: 120,
    iy: 750,
  },
  {
    id: "kallinos",
    name: "KALLINOS",
    kind: "app",
    status: "prod",
    schema: "DBなし（公開サイト）",
    description: "KALLINOSブランドサイト。公開ページのみでDB接続なし。",
    aliases: ["kallinos", "カリノス"],
    ix: 120,
    iy: 640,
  },
  {
    id: "ext-smarthello",
    name: "Smart Hello",
    kind: "external",
    status: "external",
    description: "会員名簿・一時利用者名簿・予約一覧のxlsx 3ファイル。member-osの/importで取り込む。",
    aliases: ["smarthello", "スマートハロー"],
    ix: 430,
    iy: 40,
  },
  {
    id: "ext-bank",
    name: "銀行・AMEX CSV",
    kind: "external",
    status: "external",
    description: "尼崎信金・AMEXの明細CSV。Money OSの取込画面でマッピング済み。",
    aliases: [],
    ix: 800,
    iy: 40,
  },
  {
    id: "ext-webedi",
    name: "ワークスWebEDI",
    kind: "external",
    status: "external",
    description: "ワークスダイレクト注文。GolfOrderが発注メールからWebEDI用CSVを生成して投入する。",
    aliases: ["webedi", "ワークス"],
    ix: 120,
    iy: 520,
  },
  {
    id: "ext-web",
    name: "Web・LINE・メール",
    kind: "external",
    status: "external",
    description: "お客様からの入口。予約申込（公式LINE→公開ページ）、匿名アンケート回答、info@宛の問い合わせメール。",
    aliases: [],
    ix: 1080,
    iy: 560,
  },
];

export const EDGES: SystemEdge[] = [
  { from: "ext-smarthello", to: "member-os", label: "/import 取込", type: "external" },
  { from: "ext-bank", to: "money-golfwing", label: "CSV取込", type: "external" },
  { from: "ext-webedi", to: "golfwing", label: "発注CSV", type: "external" },
  { from: "ext-web", to: "reserve-os", label: "予約申込", type: "external" },
  { from: "ext-web", to: "survey-os", label: "匿名回答", type: "external" },
  { from: "ext-web", to: "genesis", label: "問い合わせメール", type: "external" },

  { from: "shift-cloud", to: "supabase", label: "staff / shifts / 打刻", type: "data" },
  { from: "member-os", to: "supabase", label: "mbr_", type: "data" },
  { from: "money-golfwing", to: "supabase", label: "mon_", type: "data" },
  { from: "legal-os", to: "supabase", label: "leg_ + Storage", type: "data" },
  { from: "survey-os", to: "supabase", label: "svy_", type: "data" },
  { from: "reserve-os", to: "supabase", label: "res_", type: "data" },
  // 申込 → スタッフの「やること」(sp_tasks 店舗共通タスク)。DECISIONS #55
  { from: "reserve-os", to: "shift-cloud", label: "申込→やること(sp_tasks)", type: "data" },
  { from: "caddy-os", to: "supabase", label: "cad_", type: "data" },
  { from: "lesson-os", to: "supabase", label: "lsn_", type: "data" },
  { from: "golfwing", to: "supabase", label: "D1→移行中", type: "data" },
  { from: "sales-os", to: "supabase", label: "sales_os（同居）", type: "data" },
  { from: "demo-sales", to: "supabase", label: "dms_", type: "data" },
  { from: "ext-web", to: "demo-sales", label: "営業先の現サイト分析", type: "external" },
  { from: "demo-sales", to: "genesis", label: "営業指示 directive / 正式制作移行", type: "approval" },

  { from: "supabase", to: "kernel", label: "実データ", type: "kpi" },
  { from: "shift-cloud", to: "kernel", label: "労務KPI(0008)", type: "kpi" },
  { from: "money-golfwing", to: "kernel", label: "refresh_finance_kpis", type: "kpi" },
  { from: "caddy-os", to: "kernel", label: "refresh_caddy_finance", type: "kpi" },
  { from: "kernel", to: "genesis", label: "5大KPI・事業別PL", type: "kpi" },

  { from: "genesis", to: "supabase", label: "閲覧・承認", type: "data" },
  { from: "legal-os", to: "genesis", label: "approval_requests", type: "approval" },
  { from: "survey-os", to: "genesis", label: "company_events", type: "approval" },
  { from: "supabase", to: "report-os", label: "mbr_ / kpis / fin_entries", type: "kpi" },
  { from: "report-os", to: "genesis", label: ".pptx 承認", type: "approval" },

  { from: "ext-web", to: "corporate", label: "公開サイト", type: "external" },
  { from: "ext-web", to: "kallinos", label: "公開サイト", type: "external" },
];

/** フロー図一覧タブに出す順序 */
export const FLOW_LIST: { file: string; title: string }[] = [
  { file: "map.svg", title: "全体接続マップ" },
  { file: "shift-cloud.svg", title: "Shift Cloud（勤怠・給与）" },
  { file: "member-os.svg", title: "Member OS（体験受付・名簿）" },
  { file: "money-os.svg", title: "Money OS（money-golfwing）" },
  { file: "caddy-os.svg", title: "Caddy OS（キャディ派遣）" },
  { file: "golfwing.svg", title: "GolfOrder（店頭注文・発注）" },
  { file: "legal-os.svg", title: "Legal OS（契約・期限管理）" },
  { file: "survey-os.svg", title: "Survey OS（アンケート）" },
  { file: "reserve-os.svg", title: "Reserve OS（ビジター予約）" },
  { file: "report-os.svg", title: "Report OS（月次資料）" },
  { file: "genesis-secretary.svg", title: "GENESIS — CEO AI秘書 / Inbox" },
  { file: "sales-os.svg", title: "Sales OS（営業サポート）" },
];

/** 死活監視の対象（確認済みURLのみ） */
export const HEALTH_TARGETS: { id: string; url: string }[] = NODES.filter(
  (n): n is SystemNode & { healthUrl: string } => typeof n.healthUrl === "string"
).map((n) => ({ id: n.id, url: n.healthUrl }));
// EOF-topology
