-- 0039_staff_portal.sql
-- スタッフポータル拡張（DECISIONS #48）
--
-- 目的: Shift Cloudのスタッフ画面を「スタッフOS」に育てる。
--   (1) sp_tasks          … 本日のやること（本人/店長/Genesis/AIがタスクを配れる）
--   (2) sp_reports        … 日報・週報（CEO AIの日次レポートに要約流入する入口）
--   (3) sp_calendar_memos … 月間カレンダーの本人メモ（本人のみ閲覧可）
--   (4) sp_links          … 店舗クイックリンク（Smart Hello等。URLのみ、秘密情報はVault）
--
-- 予約システム連携の設計方針（疎結合）:
--   カレンダーは「(store_id, date) をキーにした日別フィード」にソースを合流させる方式。
--   現在= shifts / store_events / sp_calendar_memos。将来= Reserve OS(rsv_*) や
--   体験予約(mbr_trial_bookings) をアプリ側アダプタ（getDayFeed）で追加する。FKでは結合しない。
--
-- 追加のみ（DECISIONS #2）。金額なし・個人情報は本文テキストのみ。

-- 1. 本日のやること
create table if not exists sp_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),          -- 担当者
  store_id uuid references stores(id),                  -- 任意（店舗タスク）
  date date not null,                                   -- 実施日
  title text not null,
  note text,
  status text not null default 'open' check (status in ('open', 'done')),
  source text not null default 'manual' check (source in ('manual', 'manager', 'genesis', 'ai')),
  sort integer not null default 0,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sp_tasks_staff_date on sp_tasks (staff_id, date) where deleted_at is null;
create index if not exists idx_sp_tasks_company_date on sp_tasks (company_id, date) where deleted_at is null;
comment on table sp_tasks is 'スタッフの本日のやること。source=genesis/aiはGenesis判断リスト・AI指示からの配信（後続フェーズ）';

-- 2. 日報・週報
create table if not exists sp_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  store_id uuid references stores(id),
  type text not null check (type in ('daily', 'weekly')),
  date date not null,                                   -- daily=当日 / weekly=週の月曜日
  body text not null,
  ai_summary text,                                      -- CEO AI要約（後続。人の本文は上書きしない）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_sp_reports_staff_type_date on sp_reports (staff_id, type, date) where deleted_at is null;
create index if not exists idx_sp_reports_company_date on sp_reports (company_id, date desc) where deleted_at is null;
comment on table sp_reports is '日報・週報。weeklyのdateは週の月曜日で正規化';

-- 3. カレンダーメモ（本人のみ）
create table if not exists sp_calendar_memos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  date date not null,
  memo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_sp_memos_staff_date on sp_calendar_memos (staff_id, date) where deleted_at is null;

-- 4. クイックリンク（store_id null = 全店舗共通）
create table if not exists sp_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  label text not null,
  url text not null,
  note text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sp_links_company on sp_links (company_id, sort) where deleted_at is null;
comment on table sp_links is '店舗クイックリンク。URLのみ保持し、ID/パスワードはVault（vault_systems）に置く';

-- RLS
alter table sp_tasks enable row level security;
alter table sp_reports enable row level security;
alter table sp_calendar_memos enable row level security;
alter table sp_links enable row level security;

-- sp_tasks / sp_reports / sp_links: テナント内で読み書き（0001の標準と同型）
do $$
declare t text;
begin
  foreach t in array array['sp_tasks', 'sp_reports', 'sp_links']
  loop
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- sp_calendar_memos: 本人のみ（staff_wagesのwages_select_selfと同型）
create policy memos_select_self on sp_calendar_memos for select to authenticated
  using (
    company_id = app.current_company_id()
    and staff_id = (select id from staff where auth_user_id = auth.uid() limit 1)
  );
create policy memos_insert_self on sp_calendar_memos for insert to authenticated
  with check (
    company_id = app.current_company_id()
    and staff_id = (select id from staff where auth_user_id = auth.uid() limit 1)
  );
create policy memos_update_self on sp_calendar_memos for update to authenticated
  using (
    company_id = app.current_company_id()
    and staff_id = (select id from staff where auth_user_id = auth.uid() limit 1)
  );
