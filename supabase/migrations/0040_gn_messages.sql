-- 0040_gn_messages.sql
-- 社内連絡（役員→古川の連絡ノート / 2026-07-13ユーザー要望）
--
-- 目的: 役員（小川さん等）が古川さんに伝えたいことを書き残し、
--       古川さんが未対応一覧で確認して「対応済み」にできる仕組み。
--       口頭・LINEで流れる連絡をGENESISに集約する。
-- 追加のみ（DECISIONS #2）。

create table if not exists gn_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  from_staff_id uuid not null references staff(id),
  body text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  reply text,                                   -- 古川さんの返信メモ（任意）
  replied_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_gn_messages_company on gn_messages (company_id, status, created_at desc) where deleted_at is null;
comment on table gn_messages is '社内連絡ノート（役員→経営）。GENESIS /notes';

alter table gn_messages enable row level security;
create policy tenant_select on gn_messages for select to authenticated using (company_id = app.current_company_id());
create policy tenant_insert on gn_messages for insert to authenticated with check (company_id = app.current_company_id());
create policy tenant_update on gn_messages for update to authenticated using (company_id = app.current_company_id());
