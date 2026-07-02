-- 0001_foundation: Genesis基盤 + Workforce OS Phase 1テーブル
-- 適用済み: 2026-07-02 → Supabaseプロジェクト yozan-shift-cloud (qrgpblnnhdudigarrtuz)
create schema if not exists app;

-- updated_at自動更新
create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- enums
create type employment_type as enum ('fulltime','parttime','contractor','lesson_pro');
create type staff_status as enum ('active','inactive');
create type scope_type as enum ('company','brand','store');
create type schedule_category as enum ('work','leave','other');
create type actor_type as enum ('human','ai','system');

-- ===== テナント・組織 =====
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  brand_id uuid not null references brands(id),
  name text not null,
  code text,
  address text,
  open_time time,
  close_time time,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  auth_user_id uuid unique references auth.users(id),
  name text not null,
  name_kana text,
  email text,
  login_id text,
  employment_type employment_type not null default 'parttime',
  position text,
  status staff_status not null default 'active',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, login_id)
);

create table staff_store_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  store_id uuid not null references stores(id),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (staff_id, store_id)
);

create table staff_wages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  hourly_wage integer,
  monthly_salary integer,
  commute_allowance integer not null default 0,
  effective_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ===== 権限 =====
create table roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table staff_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  role_id uuid not null references roles(id),
  scope_type scope_type not null default 'company',
  scope_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ===== テンプレート・予定種別 =====
create table shift_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  start_time time,
  end_time time,
  is_day_off boolean not null default false,
  color text not null default '#0F6B4F',
  scope_type scope_type not null default 'company',
  scope_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table schedule_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  category schedule_category not null default 'work',
  color text not null default '#71717a',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ===== 監査ログ（insertのみ・不変） =====
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  actor_staff_id uuid references staff(id),
  actor_type actor_type not null default 'human',
  action text not null,
  table_name text not null,
  record_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ===== インデックス =====
create index on brands (company_id);
create index on stores (company_id, brand_id);
create index on staff (company_id, status);
create index on staff_store_assignments (company_id, store_id);
create index on staff_wages (staff_id, effective_from desc);
create index on staff_roles (company_id, staff_id);
create index on shift_templates (company_id, sort_order);
create index on schedule_types (company_id, sort_order);
create index on audit_logs (company_id, created_at desc);

-- ===== updated_atトリガー =====
do $$
declare t text;
begin
  foreach t in array array['companies','brands','stores','staff','staff_store_assignments','staff_wages','roles','staff_roles','shift_templates','schedule_types']
  loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

-- ===== RLS =====
create or replace function app.current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.staff
  where auth_user_id = auth.uid() and deleted_at is null
  limit 1
$$;
grant usage on schema app to authenticated;
grant execute on function app.current_company_id() to authenticated;

alter table companies enable row level security;
alter table brands enable row level security;
alter table stores enable row level security;
alter table staff enable row level security;
alter table staff_store_assignments enable row level security;
alter table staff_wages enable row level security;
alter table roles enable row level security;
alter table staff_roles enable row level security;
alter table shift_templates enable row level security;
alter table schedule_types enable row level security;
alter table audit_logs enable row level security;

-- companies: 自社のみ
create policy tenant_select on companies for select to authenticated
  using (id = app.current_company_id());
create policy tenant_update on companies for update to authenticated
  using (id = app.current_company_id());

-- テナント分離（標準テーブル）
do $$
declare t text;
begin
  foreach t in array array['brands','stores','staff','staff_store_assignments','roles','staff_roles','shift_templates','schedule_types']
  loop
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- staff_wages: 本人のみselect可（管理者アクセスはservice_role経由 → DECISIONS #3）
create policy wages_select_self on staff_wages for select to authenticated
  using (
    company_id = app.current_company_id()
    and staff_id = (select id from staff where auth_user_id = auth.uid() limit 1)
  );

-- audit_logs: insertと自社selectのみ（update/deleteはポリシーなし=拒否）
create policy audit_insert on audit_logs for insert to authenticated
  with check (company_id = app.current_company_id());
create policy audit_select on audit_logs for select to authenticated
  using (company_id = app.current_company_id());
