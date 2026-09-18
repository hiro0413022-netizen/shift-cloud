/* ============================================================
   店舗のシステムへの入口（#244 ⑧）
   ユーザー指摘「予約確認など他システムに飛びにくい」。
   各アプリは Vercel の別プロジェクトなので、GENESIS からは URL で飛ぶ。
   URL の正典は vault_systems だが、画面の描画で毎回台帳を引かないよう既知の本番URLをここに持つ
   （judgment-feed.ts の MEMBER_OS_URL 等と同じ扱い）。新アプリを出したらここにも足す。
   server-only を入れない（テストと client から読めるように）。
   ============================================================ */

export const MEMBER_OS_URL = "https://member-os-tau.vercel.app";
export const SHIFT_CLOUD_URL = "https://shift-cloud-shift-cloud.vercel.app";
export const MONEY_OS_URL = "https://money-golfwing.vercel.app";
export const CRAFT_OS_URL = "https://craft-os-hironobu-s-projects.vercel.app";
export const LESSON_OS_URL = "https://lesson-os.vercel.app";
export const INVENTORY_OS_URL = "https://inventory-os-seven.vercel.app";
export const COMPE_OS_URL = "https://compe-os.vercel.app";
export const SWING_CORTEX_URL = "https://swing-cortex.vercel.app";
export const RESERVE_OS_URL = "https://shift-cloud-reserve-os.vercel.app";
export const LEGAL_OS_URL = "https://legal-os-peach.vercel.app";
export const ORDER_URL = "https://shift-cloud-golfwing.vercel.app";
export const CADDY_OS_URL = "https://caddy-os-omega.vercel.app";
export const SURVEY_OS_URL = "https://survey-os-mu.vercel.app";
export const DEMO_SALES_URL = "https://demo-sales-delta.vercel.app";
export const HP_ADMIN_URL = "https://yozan-hp-admin.vercel.app";

export type LauncherLink = { label: string; href: string; /** 状態つきの入口（今日の件数など）か */ status?: boolean };
export type LauncherCard = {
  key: string;
  name: string;
  system: string;
  icon: "cal" | "user" | "store" | "chart" | "doc" | "book" | "box" | "spark" | "flag";
  links: LauncherLink[];
  /** FRANK 系の店舗だけに出す（打席予約など） */
  frankOnly?: boolean;
};

/**
 * 店舗ごとの入口一覧。1行目が「状態つきの入口」（件数は lib/store-launcher.ts が埋める）。
 * @param storeCode stores.code（frunk* なら FRANK GOLF）
 */
export function launcherCards(isFrank: boolean): LauncherCard[] {
  const cards: LauncherCard[] = [
    {
      key: "reservations",
      name: "予約",
      system: "Member OS",
      icon: "cal",
      links: [
        { label: "今日の予約", href: `${MEMBER_OS_URL}/reservations`, status: true },
        { label: "体験の予約", href: `${MEMBER_OS_URL}/trials` },
        ...(isFrank ? [] : [{ label: "フィッティング予約申込", href: `${RESERVE_OS_URL}/requests` }]),
      ],
    },
    {
      key: "reception",
      name: "受付台帳",
      system: "Member OS",
      icon: "user",
      links: [
        { label: "今日の来店", href: `${MEMBER_OS_URL}/`, status: true },
        { label: "お客様を探す", href: `${MEMBER_OS_URL}/search` },
        ...(isFrank ? [{ label: "FRANK会員", href: `${MEMBER_OS_URL}/frunk` }] : []),
      ],
    },
    {
      key: "shift",
      name: "店舗ダッシュボード",
      system: "Shift Cloud",
      icon: "store",
      links: [
        { label: "今日のシフト", href: `${SHIFT_CLOUD_URL}/store`, status: true },
        { label: "勤怠", href: `${SHIFT_CLOUD_URL}/admin/attendance` },
        { label: "シフト作成", href: `${SHIFT_CLOUD_URL}/admin/shifts` },
      ],
    },
    {
      key: "money",
      name: "お金",
      system: "Money OS",
      icon: "chart",
      links: [
        { label: "今日の売上", href: `${MONEY_OS_URL}/`, status: true },
        { label: "経費を入れる", href: `${MONEY_OS_URL}/expense` },
        { label: "売上を入れる", href: `${MONEY_OS_URL}/sales` },
        { label: "分析", href: `${MONEY_OS_URL}/analysis` },
      ],
    },
    {
      key: "lesson",
      name: "レッスン",
      system: "Lesson OS",
      icon: "book",
      links: [
        { label: "今日のレッスン", href: `${LESSON_OS_URL}/`, status: true },
        { label: "カルテ", href: `${LESSON_OS_URL}/students` },
      ],
    },
    {
      key: "craft",
      name: "フィッティング・工房",
      system: "Craft OS",
      icon: "doc",
      links: [
        { label: "見積・注文書", href: `${CRAFT_OS_URL}/`, status: true },
        { label: "工房（印刷）", href: `${CRAFT_OS_URL}/print` },
      ],
    },
    {
      key: "inventory",
      name: "在庫・発注",
      system: "Inventory OS",
      icon: "box",
      links: [
        { label: "在庫", href: `${INVENTORY_OS_URL}/items`, status: true },
        { label: "棚卸", href: `${INVENTORY_OS_URL}/count` },
        { label: "入出庫", href: `${INVENTORY_OS_URL}/movements` },
      ],
    },
    {
      key: "cortex",
      name: "AIカルテナレッジ",
      system: "SWING CORTEX",
      icon: "spark",
      links: [
        { label: "診断", href: `${SWING_CORTEX_URL}/` },
        { label: "ナレッジ管理", href: `${SWING_CORTEX_URL}/manage` },
        { label: "生徒", href: `${SWING_CORTEX_URL}/students` },
      ],
    },
    {
      key: "compe",
      name: "コンペ",
      system: "Compe OS",
      icon: "flag",
      links: [
        { label: "開催中のコンペ", href: `${COMPE_OS_URL}/`, status: true },
        { label: "成績表", href: `${COMPE_OS_URL}/` },
      ],
    },
  ];
  return cards;
}

/* ============================================================
   システムへ直行カード（#248）
   ユーザー指摘「各システムにすぐ飛べるように。ゴルフウィングのダッシュボードの下の
   カードみたいになっているのが使いやすい」（Shift Cloud /store の「業務システム」＝ sp_links）。
   GENESIS ホームの下に同じ形（名前＋一言・押すと別タブ）で並べる。
   並び: 下の既知アプリ → sp_links（店舗の業務リンク。Smart Hello・発注サイト等）。
   sp_links は Shift Cloud と同じ台帳なので、あちらで足したリンクはこちらにも出る。
   同じ URL（ホスト）が両方にあれば既知アプリ側を残す。
   ============================================================ */

export type SystemCard = {
  key: string;
  name: string;
  note: string | null;
  href: string;
  icon: "cal" | "user" | "store" | "chart" | "doc" | "book" | "box" | "spark" | "flag" | "link" | "check";
  /** sp_links 由来のときの店舗名（全店共通なら null） */
  store?: string | null;
};

export const SYSTEM_CARDS: SystemCard[] = [
  // 2026-09-19 ユーザー要望「GOLF WING のシフトボードみたいに全システムへ飛べるカードを、ホームの一番最初に」。
  // 店舗でよく使う順 → 管理・営業の順。新しいアプリを本番に出したらここに足す（テストが https を確かめる）。
  { key: "member", name: "Member OS", note: "予約・受付台帳・会員", href: MEMBER_OS_URL, icon: "user" },
  { key: "reservations", name: "今日の予約", note: "Member OS の予約表", href: `${MEMBER_OS_URL}/reservations`, icon: "cal" },
  { key: "shift", name: "Shift Cloud", note: "シフト・勤怠・店舗ダッシュボード", href: SHIFT_CLOUD_URL, icon: "store" },
  { key: "money", name: "Money OS", note: "売上・経費・分析", href: MONEY_OS_URL, icon: "chart" },
  { key: "lesson", name: "Lesson OS", note: "レッスンカルテ・動画", href: LESSON_OS_URL, icon: "book" },
  { key: "craft", name: "Craft OS", note: "フィッティング表紙・見積・注文書・工房", href: CRAFT_OS_URL, icon: "doc" },
  { key: "order", name: "発注管理", note: "仕入先への発注・入荷・商品マスタ", href: ORDER_URL, icon: "box" },
  { key: "inventory", name: "Inventory OS", note: "在庫・棚卸・入出庫", href: INVENTORY_OS_URL, icon: "box" },
  { key: "reserve", name: "Reserve OS", note: "ビジター・フィッティング申込", href: RESERVE_OS_URL, icon: "cal" },
  { key: "cortex", name: "SWING CORTEX", note: "AIカルテナレッジ・診断", href: SWING_CORTEX_URL, icon: "spark" },
  { key: "compe", name: "Compe OS", note: "コンペ・成績表", href: COMPE_OS_URL, icon: "flag" },
  { key: "caddy", name: "Caddy OS", note: "キャディ派遣・台帳", href: CADDY_OS_URL, icon: "user" },
  { key: "hp", name: "HP管理", note: "ホームページ・ブログ・閲覧数", href: HP_ADMIN_URL, icon: "doc" },
  { key: "sales", name: "AI DEMO SALES", note: "HP制作営業・デモ", href: DEMO_SALES_URL, icon: "spark" },
  { key: "survey", name: "Survey OS", note: "アンケート・集計", href: SURVEY_OS_URL, icon: "check" },
  { key: "legal", name: "Legal OS", note: "契約書・法務", href: LEGAL_OS_URL, icon: "check" },
];

export type RawLink = { id: string; label: string; url: string; note: string | null; store?: string | null };

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** 「Smart Hello（予約スケジュール）」→ 名前「Smart Hello」・一言「予約スケジュール」 */
export function splitLinkLabel(label: string): { name: string; note: string | null } {
  const m = label.match(/^(.+?)[（(](.+)[）)]\s*$/);
  return m ? { name: m[1].trim(), note: m[2].trim() } : { name: label.trim(), note: null };
}

/**
 * 既知アプリ＋ sp_links を1列にする（純関数・テスト対象）。
 * 既知アプリと同じホストの sp_links は捨てる（二重に出さない）。sp_links 同士の重複も1つに。
 * 一言は sp_links の note より、ラベルの括弧（何のシステムか）を優先する。
 */
export function mergeSystemCards(base: SystemCard[], links: RawLink[]): SystemCard[] {
  const seen = new Set(base.map((c) => hostOf(c.href)).filter((h): h is string => h != null));
  const out = [...base];
  for (const l of links) {
    const host = hostOf(l.url);
    if (!host || !/^https?:/i.test(l.url)) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    const { name, note } = splitLinkLabel(l.label);
    out.push({ key: `link:${l.id}`, name, note: note ?? l.note, href: l.url, icon: "link", store: l.store ?? null });
  }
  return out;
}
