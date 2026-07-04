-- 0004_genesis_kernel.sql
-- YOZAN Genesis Kernel: 会社OSの中核テーブル群（追加のみ・既存テーブル変更なし）
-- 既存再利用: audit_logs / approval_requests / notifications / ai_suggestions / integration_configs
-- 標準: company_id + RLS(app.current_company_id()) / 論理削除 / updated_atトリガー (DECISIONS #16,#17)

-- ============================================================
-- 1. modules — モジュールレジストリ（App Factory基盤）
-- ============================================================
create table modules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name text not null,
  description text,
  domain text, -- workforce / inventory / reservation / crm / ec / dev / ...
  status text not null default 'planned', -- planned / designing / building / testing / live / paused
  owner_agent text,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

-- ============================================================
-- 2. company_events — 会社で起きるすべての出来事（Kernelの中心）
-- ============================================================
create table company_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  event_type text not null, -- member.joined / reservation.created / deploy.succeeded / decision.made / ...
  title text not null,
  description text,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual', -- manual / system / webhook:github / agent:ceo_ai / ...
  source_type text not null default 'human', -- human / system / ai / external
  severity text not null default 'info', -- info / notice / warning / critical
  status text not null default 'recorded', -- recorded / in_progress / resolved / archived
  priority int not null default 3, -- 1(高)〜5(低)
  amount int, -- 金額（円・integer, DECISIONS #4）
  tags text[] not null default '{}',
  related_staff_id uuid references staff(id),
  related_store_id uuid references stores(id),
  related_module_id uuid references modules(id),
  related_customer_id uuid,
  related_project_id uuid,
  related_product_id uuid,
  related_reservation_id uuid,
  related_order_id uuid,
  raw_payload jsonb,
  ai_summary text,
  ai_interpretation text,
  ai_next_action text,
  human_approval_required boolean not null default false,
  approved_by uuid references staff(id),
  approved_at timestamptz,
  result text,
  learnings text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_company_events_occurred on company_events (company_id, occurred_at desc);
create index idx_company_events_type on company_events (company_id, event_type);

-- ============================================================
-- 3. business_memories — 会社の記憶
-- ============================================================
create table business_memories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  category text not null default 'general', -- decision / customer / staff / store / product / playbook / meeting / general
  summary text not null,
  context text,
  source text,
  importance int not null default 3, -- 1(高)〜5(低)
  confidence int not null default 3, -- 1(高)〜5(低)
  ai_generated boolean not null default false,
  human_verified boolean not null default false,
  learnings text,
  future_recommendation text,
  tags text[] not null default '{}',
  related_event_ids uuid[] not null default '{}',
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 4. decision_logs — 意思決定ログ
-- ============================================================
create table decision_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  decision_type text not null default 'business', -- business / development / hr / finance / product
  context text,
  options_considered text,
  selected_option text,
  reason text,
  expected_result text,
  actual_result text,
  outcome text not null default 'pending', -- pending / success / failure / mixed
  ai_recommendation text,
  human_comment text,
  decided_by uuid references staff(id),
  decided_at timestamptz not null default now(),
  related_event_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 5. ai_agents — AIエージェント台帳
-- ============================================================
create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name text not null,
  role text not null,
  description text,
  permissions jsonb not null default '{}',
  available_tools text[] not null default '{}',
  approval_required_actions text[] not null default '{}',
  current_status text not null default 'idle', -- idle / working / waiting_approval / error / paused
  current_task text,
  last_run_at timestamptz,
  performance jsonb not null default '{}',
  risk_level text not null default 'low', -- low / medium / high
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

-- ============================================================
-- 6. ai_execution_logs — AI実行ログ
-- ============================================================
create table ai_execution_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  agent_id uuid references ai_agents(id),
  task text,
  prompt text,
  input jsonb,
  output text,
  status text not null default 'running', -- running / succeeded / failed / waiting_approval
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  tokens_used int,
  cost_estimate_yen int,
  result_summary text,
  related_event_id uuid references company_events(id),
  approval_request_id uuid references approval_requests(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_ai_exec_agent on ai_execution_logs (company_id, agent_id, started_at desc);

-- ============================================================
-- 7. development_statuses — 開発状況（CEO AIが把握する対象）
-- ============================================================
create table development_statuses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  module_id uuid references modules(id),
  module_name text not null,
  phase text not null default 'design', -- design / build / test / review / approval / deploy_ready / live / error
  status text not null default 'active', -- active / blocked / done / paused
  progress int not null default 0, -- 0-100
  owner text,
  current_task text,
  completed_items text[] not null default '{}',
  remaining_items text[] not null default '{}',
  next_action text,
  ai_instruction_needed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 8. risks / 9. blockers
-- ============================================================
create table risks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  description text,
  area text, -- development / sales / finance / legal / operation / security
  severity text not null default 'medium', -- low / medium / high / critical
  status text not null default 'open', -- open / mitigated / closed
  mitigation text,
  related_module_id uuid references modules(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table blockers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  description text,
  blocking_what text,
  needs text, -- 何があれば解消するか
  status text not null default 'open', -- open / resolved
  related_module_id uuid references modules(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 10. kpis — KPI（現在値＋履歴＋目標）
-- ============================================================
create table kpis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name text not null,
  area text, -- sales / members / labor / development / ec / ...
  unit text not null default '', -- 円 / 人 / % / 件
  current_value numeric,
  target_value numeric,
  period text not null default 'monthly', -- daily / weekly / monthly
  trend jsonb not null default '[]', -- [{date, value}]
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

-- ============================================================
-- 11. simulations — 未来シミュレーション（MVPは簡易）
-- ============================================================
create table simulations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  scenario_type text not null default 'kpi', -- kpi / pricing / staffing / expansion
  assumptions jsonb not null default '{}',
  results jsonb not null default '{}',
  ai_comment text,
  status text not null default 'draft', -- draft / done
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 12. prompts — AI指示プロンプト（CEO AIが生成）
-- ============================================================
create table prompts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  target_ai text not null, -- fable5 / claude / codex / ...
  title text not null,
  body text not null,
  context jsonb not null default '{}',
  status text not null default 'draft', -- draft / issued / done
  related_module_id uuid references modules(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 13. reports — 日次/週次レポート
-- ============================================================
create table reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  report_type text not null default 'daily', -- daily / weekly / adhoc
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  generated_by text not null default 'ceo_ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- 14. connectors / 15. webhook_logs / 16. external_events — Integration Mesh
-- ============================================================
create table connectors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null, -- github / vercel / sentry / n8n / slack / gmail / line / stripe / ...
  name text not null,
  kind text not null, -- dev / communication / commerce / analytics / ops
  status text not null default 'planned', -- planned / configured / active / error
  config jsonb not null default '{}',
  webhook_token_hash text, -- sha256（DECISIONS #12と同方式）
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  connector_id uuid references connectors(id),
  headers jsonb,
  payload jsonb,
  status text not null default 'received', -- received / processed / error
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table external_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  connector_id uuid references connectors(id),
  external_type text not null, -- push / deployment / issue / message / ...
  external_id text,
  payload jsonb not null default '{}',
  processed boolean not null default false,
  company_event_id uuid references company_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_external_events_unprocessed on external_events (company_id, processed) where processed = false;

-- ============================================================
-- トリガー＋RLS（既存標準の流用）
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'modules','company_events','business_memories','decision_logs','ai_agents',
    'ai_execution_logs','development_statuses','risks','blockers','kpis',
    'simulations','prompts','reports','connectors','webhook_logs','external_events'
  ] loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;
