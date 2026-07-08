-- FRUNK GOLF 姫路 会員制度（Smart Hello外・member-os管理）
-- 申込(pending)→スタッフ承認→在籍(active)、休会(suspended)/退会(left)/却下(rejected)
-- プランはfrunk_plansで編集（月額・入会金・1日/週の予約上限）。適用: MCP apply_migration済 2026-07-08。

create table if not exists frunk_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  name text not null,
  monthly_price integer,
  joining_fee integer,
  max_bookings_per_day integer,
  max_bookings_per_week integer,
  color text,
  sort_order integer not null default 0,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists frunk_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  plan_id uuid references frunk_plans(id),
  member_no text,
  name text not null,
  name_kana text,
  birth_date date,
  gender text,
  postal_code text,
  address1 text,
  phone text,
  email text,
  occupation text,
  contact_method text,
  payment_method text,
  start_date date,
  join_date date,
  leave_date date,
  suspend_start date,
  suspend_end date,
  status text not null default 'pending' check (status in ('pending','active','suspended','left','rejected')),
  consent_privacy boolean not null default false,
  consent_terms boolean not null default false,
  signature text,
  note text,
  reviewed_by uuid references staff(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_frunk_members_company_status on frunk_members (company_id, status);

create table if not exists frunk_signup_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  token_hash text not null unique,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table frunk_plans enable row level security;
alter table frunk_members enable row level security;
alter table frunk_signup_tokens enable row level security;

drop trigger if exists set_updated_at on frunk_plans;
create trigger set_updated_at before update on frunk_plans for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at on frunk_members;
create trigger set_updated_at before update on frunk_members for each row execute function app.set_updated_at();
