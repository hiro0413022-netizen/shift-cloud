/**
 * @yozan/content — AI営業 SNSインバウンド（migration 0091 / DECISIONS #101）
 *
 * PGA NOTE / SWING CORTEX の見込み客を「毎日の価値ある投稿」で集める。
 * 流れ: 毎朝cronが生成(generate) → ai_action_queue(sns_post, approval)で承認
 *       → 予定時刻に10分cronが publishDue() → Instagram Graph API へ自動投稿。
 *
 * コールドDMの完全自動は規約上の合法ルートが無い（DESIGN.md §3-B・2026-08-04調査）。
 * このパッケージが扱うのは「自分のアカウントの投稿」＝公式APIで完全自動化が許される領域のみ。
 */

/**
 * 売り込む商品。投稿のトーン・CTA・ブランド色・投稿先Instagramアカウントがこれで決まる。
 * pganote / swing-cortex → @swingcortex_jp（コーチ向け・env IG_ACCESS_TOKEN / IG_BUSINESS_ID）
 * webdesign             → @yozan_web_jp（HP制作営業・env IG_ACCESS_TOKEN_WEB / IG_BUSINESS_ID_WEB）
 */
export type Product = "pganote" | "swing-cortex" | "webdesign";

export type PostStatus = "draft" | "awaiting_approval" | "scheduled" | "posted" | "failed" | "rejected";

export const PRODUCT_LABEL: Record<Product, string> = {
  pganote: "PGA NOTE",
  "swing-cortex": "SWING CORTEX",
  webdesign: "HP制作",
};

/** cnt_posts 1行 */
export type CntPost = {
  id: string;
  companyId: string;
  product: Product;
  platform: string;
  theme: string | null;
  hook: string;
  body: string;
  hashtags: string[];
  status: PostStatus;
  scheduledAt: string | null;
  postedAt: string | null;
  igMediaId: string | null;
  /** X（旧Twitter）側のツイートID。#103 で追加（1行をIG・Xの両方へ配信する） */
  xTweetId: string | null;
  xPostedAt: string | null;
  /** IG配信の失敗理由・未設定注記 */
  error: string | null;
  /** X配信の失敗理由・未設定注記（IGとは独立） */
  xError: string | null;
  source: Record<string, unknown>;
  metrics: Record<string, unknown>;
  queueId: string | null;
  createdAt: string;
};

/** 投稿の生成結果（Claude / テンプレートのどちらでも同じ形） */
export type GeneratedPost = {
  /** ネタの短い説明（重複回避の照合キー。例: 「スライスの原因は振り遅れ」） */
  theme: string;
  /** カード画像に載せる見出し（30字程度） */
  hook: string;
  /** キャプション全文（CTA込み・ハッシュタグ除く） */
  body: string;
  hashtags: string[];
  /** 生成方法の証跡 */
  generator: "claude" | "template";
};

/** SWING CORTEX 資産から引いた「本日の題材」（sc_symptoms + sc_checkpoints + sc_knowledge） */
export type Material = {
  symptomId: string;
  symptomName: string;
  category: string | null;
  points: Array<{
    title: string; // チェック項目（体の動き）
    cause: string | null;
    fix: string | null;
    drill: string | null;
  }>;
};

/** 最小限の Supabase クライアント面（@yozan/core/supabase/admin の createAdmin() を渡す） */
export type AdminClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
