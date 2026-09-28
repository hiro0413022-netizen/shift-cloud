-- ============================================================
-- 0208: Genesis Core P0（Transformation・DECISIONS #290）
--
-- 背景（2026-09-28 ユーザーGO）: Genesis を「システムを選ぶソフト」から
-- 「目的を伝えれば動く AI Operating System」へ。P0 は Core の切り出しで、
-- 画面は変えない。ここでは Core が記録に使う表だけを **追加** する。
--
-- 触らないもの: 既存 243 テーブル・ai_action_queue / ai_execution_policies（そのまま昇格して使う）。
-- 追加のみ（DECISIONS #2）。rollback は末尾のコメント参照（drop だけで戻る）。
--
--   1. gn_tool_executions … Tool 実行の全記録（Developer Dashboard の正典・idempotency の鍵）
--   2. gn_plans / gn_plan_steps … Plan（DAG）。P0 は逐次だが構造は依存・条件を持つ
--   3. gn_events … 機械が読む outbox（type@schema_version）。company_events は人が読む方で残す
--   4. gn_llm_calls … Model Router の記録（件数・トークン・概算コスト）
--   5. gn_tool_policies … Tool 固有の権限ルール（Tool×Role×Store×Amount）
--   6. gn_personas … Presentation Layer（「CEO AI」「経理AI」）。内部は同じ Orchestrator
--
-- 権限: すべて service_role だけ。authenticated には SELECT ポリシーのみ（自社分）。
-- ============================================================

-- 1. Tool 実行記録 ------------------------------------------------------------
create table if not exists gn_tool_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid,
  actor_staff_id uuid references staff(id),
  actor_kind text not null default 'human' check (actor_kind in ('human', 'ai', 'system')),
  surface text,                       -- web / mobile / ipad / line / voice / mcp / api / cron
  origin text,                        -- jarvis / ai_action_queue / api / mcp / cron / 呼び元Tool
  plan_id uuid,
  step_id uuid,
  tool_name text not null,            -- 'booking.create'
  tool_version int not null default 1,
  risk int not null default 0,
  status text not null
    check (status in ('running', 'ok', 'idempotent', 'needs_approval', 'denied', 'failed', 'verify_failed', 'invalid_input', 'unknown_tool')),
  policy_decision text,               -- allow / auto_undo / approval / two_step / deny
  policy_stage text,                  -- permission / scope / tool_rule / amount / context / risk / legacy_policy / rate_limit
  idempotency_key text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  sources jsonb,                      -- [{table, updatedAt, verified}]
  fact_kind text,                     -- fact / calculated / inference / suggestion
  row_count int,
  silent_zero boolean not null default false,
  error text,
  logs jsonb,
  duration_ms int,
  undone_at timestamptz,
  undone_by uuid references staff(id),
  created_at timestamptz not null default now()
);
comment on table gn_tool_executions is 'Genesis Core: Tool 実行の全記録。Developer Dashboard の正典。idempotency_key で二重実行を防ぐ';
comment on column gn_tool_executions.idempotency_key is '同じ鍵の ok/running 行があれば実行しない（部分一意索引）';
comment on column gn_tool_executions.silent_zero is '読み Tool が期待下限を下回った（黙って0件の検知）';

create unique index if not exists uq_gn_tool_exec_idem
  on gn_tool_executions (company_id, tool_name, idempotency_key)
  where idempotency_key is not null and status in ('ok', 'running');
create index if not exists idx_gn_tool_exec_company_time on gn_tool_executions (company_id, created_at desc);
create index if not exists idx_gn_tool_exec_tool on gn_tool_executions (company_id, tool_name, created_at desc);
create index if not exists idx_gn_tool_exec_actor_min on gn_tool_executions (company_id, tool_name, actor_staff_id, created_at desc);

-- 2. Plan（DAG） ----------------------------------------------------------------
create table if not exists gn_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  actor_staff_id uuid references staff(id),
  surface text,
  goal text not null,
  status text not null default 'draft'
    check (status in ('draft', 'running', 'waiting_approval', 'done', 'failed', 'cancelled')),
  context jsonb,                      -- Genesis Context の要約（actor/store/focus/entity/time）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table gn_plans is 'Genesis Core: 実行計画。Step の DAG を持つ（P0 は逐次実行）';

create table if not exists gn_plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references gn_plans(id) on delete cascade,
  key text not null,                  -- 'a', 'b', 'c' … Plan 内で一意
  tool_ref text not null,             -- 'shift.generate@1'（固定版で書く）
  input jsonb not null default '{}'::jsonb,
  depends_on text[] not null default '{}',
  condition jsonb,                    -- {stepKey, path, op, value}
  bind jsonb,                         -- {"input.date": "a.data.date"}
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'running', 'waiting_approval', 'done', 'skipped', 'failed')),
  output jsonb,
  execution_id uuid references gn_tool_executions(id),
  error text,
  title text,
  sort int not null default 0,
  unique (plan_id, key)
);
create index if not exists idx_gn_plan_steps_plan on gn_plan_steps (plan_id, sort);

-- 3. Event outbox ----------------------------------------------------------------
create table if not exists gn_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid,
  type text not null,                 -- 'reservation.created'（entity.verb）
  schema_version int not null default 1,
  entity_kind text,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  actor_kind text not null default 'system' check (actor_kind in ('human', 'ai', 'system')),
  actor_staff_id uuid references staff(id),
  source text,                        -- 'booking.create@1' / 'trigger:frunk_bookings'
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);
comment on table gn_events is 'Genesis Core: 機械が読む outbox。type@schema_version で並存。Timeline / Activity Graph / Workflow trigger の元';
create index if not exists idx_gn_events_unprocessed on gn_events (company_id, occurred_at) where processed_at is null;
create index if not exists idx_gn_events_entity on gn_events (company_id, entity_kind, entity_id, occurred_at desc);
create index if not exists idx_gn_events_type on gn_events (company_id, type, occurred_at desc);

-- 4. LLM 呼び出し記録 --------------------------------------------------------------
create table if not exists gn_llm_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  task text not null,                 -- classify / extract / sql / summary / plan / analyze / merge / draft / code
  privacy text not null default 'L1' check (privacy in ('L1', 'L2', 'L3')),
  provider text not null,             -- anthropic / local
  model text not null,
  tool text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  duration_ms int,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
comment on table gn_llm_calls is 'Genesis Core: Model Router の記録。Dashboard の LLM Call / Cost';
create index if not exists idx_gn_llm_calls_company_time on gn_llm_calls (company_id, created_at desc);

-- 5. Tool 固有の権限ルール ------------------------------------------------------------
create table if not exists gn_tool_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  tool text not null,                 -- 'shift.publish' or 'shift.publish@1'
  require_permissions text[] not null default '{}',  -- いずれかを持つ人だけ（空=Tool既定）
  store_ids uuid[] not null default '{}',            -- この店舗だけ（空=制限なし）
  max_amount numeric,                 -- 超えたら approval
  mode text check (mode in ('allow', 'auto_undo', 'approval', 'two_step', 'deny')),
  undo_minutes int,
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tool)
);
comment on table gn_tool_policies is 'Genesis Core: Tool×Role×Store×Amount のテナント別ルール。Risk Level の既定を上書きする';

-- 6. Presentation Layer（人格） ---------------------------------------------------------
create table if not exists gn_personas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,                 -- 'ceo' / 'finance' / 'ops'
  name text not null,                 -- 'CEO AI' / '経理AI' / '店舗運営AI'
  domains text[] not null default '{}',  -- focus.domains に入る
  greeting text,
  tone text,
  avatar text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);
comment on table gn_personas is 'Genesis Core: UI 上の人格。内部は同じ Orchestrator（Focus と口調だけ変える）';

-- 権限 --------------------------------------------------------------------------------
alter table gn_tool_executions enable row level security;
alter table gn_plans enable row level security;
alter table gn_plan_steps enable row level security;
alter table gn_events enable row level security;
alter table gn_llm_calls enable row level security;
alter table gn_tool_policies enable row level security;
alter table gn_personas enable row level security;

drop policy if exists tenant_select on gn_tool_executions;
create policy tenant_select on gn_tool_executions for select to authenticated using (company_id = app.current_company_id());
drop policy if exists tenant_select on gn_plans;
create policy tenant_select on gn_plans for select to authenticated using (company_id = app.current_company_id());
drop policy if exists tenant_select on gn_events;
create policy tenant_select on gn_events for select to authenticated using (company_id = app.current_company_id());
drop policy if exists tenant_select on gn_tool_policies;
create policy tenant_select on gn_tool_policies for select to authenticated using (company_id = app.current_company_id());
drop policy if exists tenant_select on gn_personas;
create policy tenant_select on gn_personas for select to authenticated using (company_id = app.current_company_id());
-- gn_plan_steps / gn_llm_calls は service_role のみ（authenticated にポリシーを付けない）

-- 初期ルール（YOZAN）: 例として GO 条件にあった3つ。値はユーザーが Genesis から変えられる（P1）
insert into gn_tool_policies (company_id, tool, require_permissions, note)
select c.id, v.tool, v.perms, v.note
from companies c
cross join (values
  ('shift.publish',  array['manage_shifts', 'manage_company']::text[], '店長以上'),
  ('payroll.update', array['manage_payroll', 'manage_company']::text[], 'Finance / Owner のみ'),
  ('booking.update', array['use_reception', 'manage_company']::text[], '店舗スタッフ可')
) as v(tool, perms, note)
where c.name like '%YOZAN%'
on conflict (company_id, tool) do nothing;

-- rollback（必要なとき手で）:
--   drop table if exists gn_plan_steps, gn_plans, gn_tool_executions, gn_events, gn_llm_calls, gn_tool_policies, gn_personas;
