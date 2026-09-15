/* ============================================================
   画面の地図（DECISIONS #244・2026-09-15）

   ユーザー指摘「genesisがすごく見にくい」「必要な情報を取りに行くのに手間がかかる」。
   それまでは「管理」の中に25画面が同じ並びで入っていて、目当ての画面を探すのに
   毎回スクロールしていた。**やることの種類**で7グループに分け、
   左メニュー・スマホのメニュー・Ctrl K 検索・JARVISの案内先を全部この1枚から作る。

   URL は1つも変えない（LINE・メール・cron のリンクを壊さない）。
   ここには server-only を入れない（node --test から読めるようにする）。
   ============================================================ */

export type NavIcon = "home" | "chart" | "check" | "user" | "chat" | "book" | "gear" | "store" | "search";

export type NavItem = {
  href: string;
  label: string;
  /** Ctrl K の検索で当てる言い換え（画面名を覚えていなくても引けるように） */
  keywords?: string[];
};

export type NavGroup = {
  key: "home" | "numbers" | "approve" | "customers" | "staff" | "records" | "settings";
  label: string;
  icon: NavIcon;
  /** グループの説明（メニューの副題・検索結果の補足） */
  about: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "home",
    label: "ホーム",
    icon: "home",
    about: "今日やること・今月の数字・GENESISに聞く",
    items: [
      { href: "/", label: "ホーム", keywords: ["トップ", "今日", "やること"] },
      { href: "/todo", label: "今日やること（全件）", keywords: ["判断", "承認", "todo"] },
      { href: "/chat", label: "データに聞く", keywords: ["ask data", "質問", "チャット", "SQL"] },
    ],
  },
  {
    key: "numbers",
    label: "数字",
    icon: "chart",
    about: "売上・会員・体験・人件費を事業別に",
    items: [
      { href: "/finance", label: "数字（事業別パフォーマンス）", keywords: ["売上", "うりあげ", "会員数", "かいいんすう", "PL", "経費", "けいひ", "収支"] },
      { href: "/future", label: "未来シミュレーション", keywords: ["資金繰り", "予測"] },
    ],
  },
  {
    key: "approve",
    label: "承認・AI",
    icon: "check",
    about: "AIが作ったものを確認して通す場所",
    items: [
      { href: "/approvals", label: "承認待ち", keywords: ["承認"] },
      { href: "/executions", label: "AI自動実行（実行予定）", keywords: ["取り消し", "実行予定", "キュー"] },
      { href: "/deliverables", label: "成果物レビュー", keywords: ["成果物"] },
      { href: "/suggestions", label: "改善提案", keywords: ["提案"] },
      { href: "/directives", label: "実行指示", keywords: ["指示"] },
      { href: "/agents", label: "AI社員", keywords: ["エージェント", "AI"] },
      { href: "/command", label: "CEO AI 司令室", keywords: ["司令室", "レポート", "日次"] },
      { href: "/ai-sales", label: "AI営業 司令室", keywords: ["営業", "集客", "SNS"] },
    ],
  },
  {
    key: "customers",
    label: "お客様",
    icon: "user",
    about: "外から来たものに対応する場所",
    items: [
      { href: "/inbox", label: "問い合わせ受信箱", keywords: ["問い合わせ", "メール", "返信"] },
      { href: "/reserve", label: "予約申込", keywords: ["予約", "フィッティング"] },
      { href: "/stores", label: "店舗のシステム", keywords: ["予約確認", "受付台帳", "シフト", "レジ", "GOLF WING", "FRANK"] },
      { href: "/site-admin", label: "FRANKサイト管理", keywords: ["サイト", "CMS", "営業時間"] },
    ],
  },
  {
    key: "staff",
    label: "社内連絡",
    icon: "chat",
    about: "スタッフとのやりとり",
    items: [
      { href: "/notice", label: "スタッフへ連絡", keywords: ["LINE", "連絡", "配信"] },
      { href: "/notes", label: "社内連絡", keywords: ["メモ"] },
      { href: "/incidents", label: "イレギュラー分析", keywords: ["報告", "日報", "異常"] },
    ],
  },
  {
    key: "records",
    label: "記録・資料",
    icon: "book",
    about: "あとで調べるもの",
    items: [
      { href: "/legal", label: "契約・法務", keywords: ["契約書", "期限"] },
      { href: "/library", label: "資料室", keywords: ["資料", "ファイル"] },
      { href: "/decisions", label: "決定事項ログ", keywords: ["決定", "DECISIONS"] },
      { href: "/events", label: "出来事ログ", keywords: ["イベント", "履歴"] },
      { href: "/memories", label: "経営メモ（AIの記憶）", keywords: ["記憶", "メモ"] },
    ],
  },
  {
    key: "settings",
    label: "設定・開発",
    icon: "gear",
    about: "たまにしか開かないもの",
    items: [
      { href: "/accounts", label: "アカウント管理", keywords: ["ログイン", "権限", "スタッフ"] },
      { href: "/vault", label: "システム台帳（ID/URL）", keywords: ["パスワード", "URL", "ID"] },
      { href: "/connectors", label: "外部連携", keywords: ["連携", "トークン"] },
      { href: "/network", label: "システム相関図", keywords: ["相関", "死活"] },
      { href: "/dev-requests", label: "開発依頼", keywords: ["依頼", "JARVIS"] },
      { href: "/dev", label: "開発状況", keywords: ["進捗"] },
    ],
  },
];

/** 全画面のフラット一覧（検索・案内先の検証用） */
export const NAV_ITEMS: (NavItem & { group: NavGroup["key"]; groupLabel: string })[] = NAV_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ ...it, group: g.key, groupLabel: g.label }))
);

/** pathname がどのグループに属するか（左メニューの開閉・スマホの下タブの点灯に使う） */
export function groupOfPath(pathname: string): NavGroup["key"] {
  if (pathname === "/" || pathname === "/todo") return "home";
  if (pathname.startsWith("/chat")) return "home";
  // /dev と /dev-requests は別物（startsWith だと両方が光る・旧 sidebar と同じ注意）
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (it.href === "/") continue;
      if (it.href === "/dev" ? pathname === "/dev" : pathname.startsWith(it.href)) return g.key;
    }
  }
  return "home";
}

export function navItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/dev") return pathname === "/dev";
  return pathname.startsWith(href);
}

/* ------------------------------------------------------------
   Ctrl K の「画面」検索。画面名・言い換え・グループ名のどれかに当たれば出す。
   ひらがな/カタカナ/大文字小文字の違いは吸収する（お客様検索と同じ感覚で打てるように）。
------------------------------------------------------------ */
export function normalizeQuery(q: string): string {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)) // ひらがな→カタカナ
    .replace(/[\s　]+/g, "");
}

export function searchNav(q: string, limit = 6): (typeof NAV_ITEMS)[number][] {
  const n = normalizeQuery(q);
  if (!n) return [];
  const score = (it: (typeof NAV_ITEMS)[number]) => {
    const label = normalizeQuery(it.label);
    if (label.startsWith(n)) return 3;
    if (label.includes(n)) return 2;
    if ((it.keywords ?? []).some((k) => normalizeQuery(k).includes(n))) return 1;
    if (normalizeQuery(it.groupLabel).includes(n)) return 0.5;
    return 0;
  };
  return NAV_ITEMS.map((it) => ({ it, s: score(it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.it);
}
