-- 0059: 実行指示に「工程（ステップ）」を持たせる（DECISIONS #59）
-- 背景:
--   改善提案（ai_suggestions）→ 実行指示（gn_directives）は1本の指示にしかできず、
--   「案は出るが現場が回らない」問題があった。実際の打ち手は
--     体験不足 → SNS広告 → 台本作成 → 撮影 → 編集 → AIがアップ
--   のように「誰が・何を・どの順で」の連鎖で、担当がスタッフとAIに分かれる。
--   → 1つの指示を『キャンペーン（工程の束）』にし、各工程を担当（スタッフ/AI社員）へ配れるようにする。
--
-- 設計:
--   - gn_directives に target_kind='campaign' を追加（親＝キャンペーン。実体の配布はしない器）。
--   - gn_directive_steps が工程台帳。工程ごとに sp_tasks（スタッフのやること）/ prompts（AI指示書）へ配る。
--   - 全工程が done/cancelled になったら親 directive も done へロールアップ（アプリ側 updateStepStatus）。

-- ============================================================
-- 1. 親指示に「キャンペーン」宛先を許可
-- ============================================================
alter table gn_directives drop constraint if exists gn_directives_target_kind_check;
alter table gn_directives
  add constraint gn_directives_target_kind_check
  check (target_kind in ('staff', 'ai_agent', 'external', 'campaign'));

-- ============================================================
-- 2. 工程台帳
-- ============================================================
create table if not exists gn_directive_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  directive_id uuid not null references gn_directives(id) on delete cascade,
  seq integer not null default 1,                 -- 実行順（1始まり）
  title text not null,                            -- この工程で何をやるか
  detail text,                                    -- やり方・台本・補足（撮影方法/構成など）
  target_kind text not null check (target_kind in ('staff', 'ai_agent')),
  staff_id uuid references staff(id),             -- target_kind=staff
  agent_id uuid references ai_agents(id),         -- target_kind=ai_agent
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done', 'cancelled')),
  sp_task_id uuid references sp_tasks(id),        -- スタッフ工程の実体
  prompt_id uuid references prompts(id),          -- AI工程の実体（指示書・下書き）
  result text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_gn_directive_steps_directive
  on gn_directive_steps (directive_id, seq) where deleted_at is null;
create index if not exists idx_gn_directive_steps_company
  on gn_directive_steps (company_id) where deleted_at is null;

-- アプリはservice_role経由（既存アプリ規約と同じ）。RLSは既定deny。
alter table gn_directive_steps enable row level security;
