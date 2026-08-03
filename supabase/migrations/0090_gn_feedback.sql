-- 0090: 修正指示の学習蓄積 gn_feedback（判断フィードの修正→学習ループ）
-- ユーザーがLINE配信等の文面に出した修正指示・直接編集・却下理由を記録し、
-- 次回の文面生成（sales-loop等）とAI修正のプロンプトに「学習ルール」として注入する。

create table if not exists gn_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  context_kind text not null,              -- 'line_broadcast' | 'staff_directive' 等（action_type）
  action_queue_id uuid,                    -- 対象の ai_action_queue.id（任意）
  instruction text not null,               -- ユーザーの修正指示（直接編集時は '（直接編集）'）
  before_text text,                        -- 修正前の文面
  after_text text,                         -- 修正後の文面
  source text not null default 'revise' check (source in ('revise','edit','reject')),
  created_by uuid,                         -- staff.id（人間の指示のみ想定）
  created_at timestamptz not null default now()
);

create index if not exists idx_gn_feedback_ctx on gn_feedback (company_id, context_kind, created_at desc);

alter table gn_feedback enable row level security;
-- ポリシー無し = service_role専用（Genesisのserver actionからのみ読み書き）
