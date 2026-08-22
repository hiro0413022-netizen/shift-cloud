/**
 * 権限カタログ（2026-08-22 / DECISIONS #142）
 *
 * roles.permissions に入るキーの一覧と、日本語での意味。
 * /admin/roles のチェックボックスはここから作る。
 *
 * ⚠ 新しいアプリを足して新しい権限キーを使い始めたら、**ここに必ず1行足すこと**。
 *   足し忘れても画面が壊れないよう、カタログに無いキーは保存時に消さず素通しする実装にしてあるが、
 *   画面には出ないので「付けられない権限」になる。
 *
 * 現況の出どころ:
 *   - shift-cloud src/lib/auth.ts の Permission 型
 *   - 各アプリ src/lib/auth.ts の createActorResolver({ anyOf: [...] })
 *   - 本番DBの roles.permissions に実在するキー
 */

export type PermissionMeta = { label: string; note: string };

export const PERMISSION_LABEL: Record<string, PermissionMeta> = {
  // --- 会社・組織 ---
  manage_company: { label: "会社オーナー", note: "全店舗を横断できる最高権限。会社設定も触れる" },
  manage_org: { label: "店舗・ブランド設定", note: "店舗の追加や営業時間の変更" },
  manage_staff: { label: "スタッフ管理", note: "スタッフの登録・編集・ロールの割り当て" },
  view_audit: { label: "監査ログを見る", note: "誰が何を変えたかの履歴" },

  // --- シフト・勤怠・給与 ---
  manage_templates: { label: "シフトテンプレート", note: "勤務パターン・予定種別の編集" },
  create_shifts: { label: "シフト作成", note: "シフトの作成・確定、休み希望の確認" },
  edit_attendance: { label: "勤怠の修正", note: "打刻の修正・月末照合・打刻端末メモ" },
  manage_kiosks: { label: "打刻端末の管理", note: "端末の発行・停止" },
  view_payroll: { label: "給与を見る", note: "給与明細の閲覧" },
  manage_payroll: { label: "給与を確定する", note: "給与の計算・確定・支給" },

  // --- 現場アプリを使う ---
  manage_announcements: { label: "お知らせ・店舗イベント", note: "スタッフ向けお知らせの配信" },
  use_reception: { label: "受付（member-os / Reserve OS）", note: "体験受付・会員管理・予約カレンダー" },
  use_lesson: { label: "レッスンカルテ（Lesson OS）", note: "スイング動画・アドバイス・進捗・計測" },
  use_coaching: { label: "コーチング診断（SWING CORTEX）", note: "症状から指導ナレッジを引く" },
  use_inventory: { label: "在庫を数える（Inventory OS）", note: "棚卸のカウント入力まで" },
  manage_inventory: { label: "在庫を確定する", note: "マスタ編集・棚卸確定・入出庫の記録" },
  use_caddy: { label: "キャディ派遣（Caddy OS）", note: "シフト・派遣確定・台帳・ゴルフ場提出" },
  use_survey: { label: "アンケート（Survey OS）", note: "アンケートの作成・集計" },
  use_legal: { label: "契約書を登録（Legal OS）", note: "契約書の下書き登録まで" },
  manage_legal_all: { label: "契約書を全社管理", note: "全社の契約書・期限管理" },
  use_demo_sales: { label: "営業デモ生成（AI DEMO SALES）", note: "新規開拓のデモサイト自動生成" },

  // --- 経営（Genesis） ---
  view_hq: { label: "本部を見る（Genesis）", note: "経営数値・KPI・判断フィード。全アプリの閲覧も付いてくる" },
  approve_suggestions: { label: "AIの提案を承認する", note: "判断フィードの承認・実行指示" },

  // --- 特殊 ---
  read_only: { label: "閲覧のみ", note: "⚠ 他の権限を全部打ち消します。単独で使ってください" },
};

export const PERMISSION_GROUPS: { title: string; keys: string[] }[] = [
  { title: "会社・組織", keys: ["manage_company", "manage_org", "manage_staff", "view_audit"] },
  {
    title: "シフト・勤怠・給与",
    keys: ["manage_templates", "create_shifts", "edit_attendance", "manage_kiosks", "view_payroll", "manage_payroll"],
  },
  {
    title: "現場アプリを使う",
    keys: [
      "manage_announcements",
      "use_reception",
      "use_lesson",
      "use_coaching",
      "use_inventory",
      "manage_inventory",
      "use_caddy",
      "use_survey",
      "use_legal",
      "manage_legal_all",
      "use_demo_sales",
    ],
  },
  { title: "経営（Genesis）", keys: ["view_hq", "approve_suggestions"] },
  { title: "特殊", keys: ["read_only"] },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_GROUPS.flatMap((g) => g.keys);
