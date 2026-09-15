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
