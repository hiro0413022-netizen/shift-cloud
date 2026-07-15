-- 0059_staff_line_broadcast.sql
-- スタッフ連絡のLINE配信（Genesisで書く→記録＋タスク化→公式LINEでグループへPush）
-- reserve-osのPushと同じ「DBキュー→n8nが拾って送信→書き戻し」方式（DECISIONS #59）。
-- ※本番へは 2026-07-15 に apply_migration 済み。ここは同期用。

-- 1. LINEグループ台帳（公式アカウントが参加したグループのIDを保持）
--    n8nの受信Webhook(YOZAN)がグループ発話を拾ったとき登録する。店舗との対応もここで持つ。
create table if not exists gn_line_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  line_group_id text not null,                 -- LINEの groupId（Cから始まる）
  label text,                                  -- 表示名（例: スタッフ連絡（YOZAN公式））
  store_id uuid references stores(id),         -- 対応店舗（やること生成の宛先）
  is_default boolean not null default false,   -- 既定の配信先
  member_count int,
  last_seen_at timestamptz,                    -- 最後にこのグループの発話を受信した時刻
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_gn_line_groups
  on gn_line_groups (company_id, line_group_id) where deleted_at is null;
comment on table gn_line_groups is 'LINE配信先グループ台帳。n8n受信Webhookがgroup発話で登録。連絡の配信先に使う';

-- 2. LINE配信キュー（Genesisが積む→n8nが拾ってPush→結果を書き戻す）
create table if not exists gn_line_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  to_group_id text not null,                   -- 送信先 groupId（gn_line_groups.line_group_id）
  body text not null,                          -- 送るメッセージ本文
  directive_id uuid references gn_directives(id), -- どの連絡から出たか（記録の紐付け）
  status text not null default 'pending' check (status in ('pending', 'sent', 'error')),
  sent_at timestamptz,
  error text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_gn_line_outbox_pending
  on gn_line_outbox (status, created_at) where status = 'pending';
comment on table gn_line_outbox is 'LINE配信キュー。status=pendingをn8nがPush→sent/error。二重送信はsent_atで防ぐ';

alter table gn_line_groups enable row level security;
alter table gn_line_outbox enable row level security;
drop policy if exists tenant_all on gn_line_groups;
create policy tenant_all on gn_line_groups for select to authenticated
  using (company_id = app.current_company_id());
drop policy if exists tenant_all on gn_line_outbox;
create policy tenant_all on gn_line_outbox for select to authenticated
  using (company_id = app.current_company_id());
