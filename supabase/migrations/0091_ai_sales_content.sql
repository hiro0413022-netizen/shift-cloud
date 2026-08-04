-- 0091: AI営業 SNSインバウンド @yozan/content（DECISIONS #101 / docs/modules/ai-sales/SYSTEM.md）
--
-- 目的: PGA NOTE / SWING CORTEX のSNS自動集客（設計書 docs/modules/ai-sales/DESIGN.md チャネルC）。
--   毎朝cronが投稿を生成 → ai_action_queue(sns_post, approval) → ホームの判断フィードで承認
--   → 予定時刻（既定18:00 JST）に10分cronが Instagram Graph API へ自動投稿。
--
-- 設計:
--   cnt_posts … SNS投稿1本＝1行。生成→承認→予約→投稿の全状態と結果(metrics)を持つ
--   投稿の承認は ai_action_queue（#61/#62の既存レール）に乗せ、専用の承認テーブルは作らない。
--   リード（LPフォーム）は新テーブルを作らず sales_os.leads / sec_inquiries へ流す（二重台帳を作らない）。
--
-- 方針:
--   - RLSは有効・ポリシーなし＝service_role専用（本リポジトリの標準形 #65）
--   - 新関数なし（EXECUTE付与の対象なし）

create table if not exists cnt_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  product text not null check (product in ('pganote', 'swing-cortex')),
  platform text not null default 'instagram' check (platform in ('instagram', 'x', 'manual')),
  theme text,                                -- ネタの短い説明（重複回避の照合キー）
  hook text not null,                        -- カード画像に載せる見出し（30字程度）
  body text not null,                        -- キャプション全文（CTA・ハッシュタグ込み）
  hashtags text[] not null default '{}',
  status text not null default 'draft' check (
    status in ('draft', 'awaiting_approval', 'scheduled', 'posted', 'failed', 'rejected')
  ),
  scheduled_at timestamptz,                  -- 投稿予定時刻（承認後、10分cronがこれを見る）
  posted_at timestamptz,
  ig_media_id text,                          -- Instagram側のメディアID（投稿成功の証跡）
  error text,                                -- 直近の失敗理由 / 設定不足の注記
  source jsonb not null default '{}',        -- 生成元（sc_symptom_id / sc_knowledge_id / 手動 等）
  metrics jsonb not null default '{}',       -- like/reach等（将来のInsights取得の入れ物）
  queue_id uuid,                             -- ai_action_queue との紐付け（承認カード）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_cnt_posts_company_status
  on cnt_posts(company_id, status, created_at desc) where deleted_at is null;
create index if not exists idx_cnt_posts_due
  on cnt_posts(status, scheduled_at) where deleted_at is null and status = 'scheduled';
create index if not exists idx_cnt_posts_product
  on cnt_posts(company_id, product, created_at desc) where deleted_at is null;

comment on table cnt_posts is 'AI営業SNSインバウンドの投稿台帳（@yozan/content・DESIGN.md チャネルC）。承認はai_action_queue(sns_post)、配信はInstagram Graph API';
comment on column cnt_posts.hook is 'カード画像（/api/public/ai-sales/card/[id]）に載せる見出し。Instagramは画像必須のためテキストをカード化して投稿する';
comment on column cnt_posts.status is 'draft=生成直後 / awaiting_approval=判断フィード掲載中 / scheduled=承認済み・時刻待ち / posted / failed / rejected';

alter table cnt_posts enable row level security;
