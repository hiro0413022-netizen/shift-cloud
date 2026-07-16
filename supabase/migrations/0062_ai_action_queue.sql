-- 0062_ai_action_queue.sql
-- DECISIONS #62 / 2026-07-16
-- #61で入れたリスク階層（ai_execution_policies）を「実際に実行する」executorの心臓部。
-- すべてのAIアクションはこのキューを1つの関所として通す:
--   enqueue → (auto=即 / auto_undo=取消枠後 / approval=承認待ち) → executorが実行 → 監査ログ
-- 取消枠(auto_undo)は「送信を undo_deadline まで遅らせる」方式＝送ってから取り消すのではなく、
--   猶予中はまだ実行しない・取消ボタンで止められる。過ぎたらexecutorが実行する（安全）。

create table ai_action_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  action_type text not null,                    -- ai_execution_policies.action_type と対応
  mode text not null check (mode in ('auto', 'auto_undo', 'approval')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,    -- ハンドラへの入力
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'cancelled', 'failed', 'awaiting_approval')),
  scheduled_at timestamptz not null default now(),  -- この時刻以降にexecutorが拾う（auto_undoは now()+undo_minutes）
  undo_deadline timestamptz,                     -- auto_undo の取消期限（=scheduled_at）
  executed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references staff(id),
  error text,
  result jsonb,
  origin_kind text,                              -- suggestion / deliverable / cron / manual / test
  origin_id uuid,
  dedupe_key text,
  created_by uuid references staff(id),          -- null = AI/システム発
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on ai_action_queue (company_id, status, scheduled_at);
create index on ai_action_queue (company_id, created_at desc);
-- 同一 dedupe_key の未処理重複を防ぐ
create unique index ai_action_queue_dedupe
  on ai_action_queue (company_id, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running', 'awaiting_approval');

alter table ai_action_queue enable row level security;
-- policyなし = service_role専用（他のAI系テーブルと同じ。UIはサーバ(service_role)経由で読む）

create trigger set_updated_at before update on ai_action_queue
  for each row execute function app.set_updated_at();

-- 無害な動作確認用アクション（/executions の「テスト実行」ボタンから使う）。
-- 取消枠つき(auto_undo)で、実行されても company_events に1行残すだけ＝副作用ゼロ。
insert into ai_execution_policies (company_id, action_type, mode, undo_minutes, note)
select id, 'test_notify', 'auto_undo', 2, '動作確認用（無害・company_eventsに記録するだけ）'
from companies order by created_at limit 1
on conflict (company_id, action_type) do nothing;
