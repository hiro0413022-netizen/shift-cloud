-- 0075: 自律ループ基盤（REDESIGN_2026-07 §4 / DECISIONS #77）
-- gn_loops = ループ定義（しきい値・頻度上限を config に持つ）
-- gn_loop_runs = 1サイクル（観測→判断→生成→実行→測定）の記録。P3でresultに測定値を書く。

create table if not exists gn_loops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,                 -- 'sales_trial_recovery' 等
  name text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists gn_loop_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  loop_id uuid not null references gn_loops(id),
  run_date date not null,
  observed jsonb not null default '{}'::jsonb,  -- 観測値（実績・目標・ペース等）
  decision text not null check (decision in ('act', 'skip')),
  reason text,
  deliverable text,                             -- 生成した文面
  action_queue_id uuid references ai_action_queue(id),
  result jsonb,                                 -- P3: 測定結果（配信後の反応）
  created_at timestamptz not null default now(),
  unique (loop_id, run_date)                    -- 1ループ1日1回
);

create index if not exists idx_gn_loop_runs_company on gn_loop_runs (company_id, run_date desc);

-- RLS: 既存 gn_* と同様 enable のみ（ポリシー無し = service_role専用）
alter table gn_loops enable row level security;
alter table gn_loop_runs enable row level security;
