-- 0002_modules: シフト・勤怠・給与・運営・AI提案
-- 適用済み: 2026-07-02 → yozan-shift-cloud (qrgpblnnhdudigarrtuz)
create type shift_status as enum ('draft','published');
create type request_period_status as enum ('open','closed');
create type shift_request_status as enum ('submitted','withdrawn');
create type time_record_type as enum ('clock_in','clock_out','break_start','break_end');
create type time_record_source as enum ('kiosk','admin','api');
create type attendance_day_status as enum ('auto','corrected','confirmed');
create type payroll_period_status as enum ('open','locked');
create type suggestion_severity as enum ('info','warning','critical');
create type suggestion_approval as enum ('pending','approved','rejected');
create type suggestion_execution as enum ('not_executed','executed','failed');
create type approval_status as enum ('pending','approved','rejected');

create table shift_request_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  target_month date not null,
  deadline date not null,
  status request_period_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table shift_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  period_id uuid not null references shift_request_periods(id),
  staff_id uuid not null references staff(id),
  date date not null,
  template_id uuid references shift_templates(id),
  memo text,
  status shift_request_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (period_id, staff_id, date)
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  store_id uuid not null references stores(id),
  date date not null,
  start_time time,
  end_time time,
  is_day_off boolean not null default false,
  template_id uuid references shift_templates(id),
  schedule_type_id uuid references schedule_types(id),
  status shift_status not null default 'draft',
  published_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (staff_id, store_id, date)
);

create table kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  name text not null,
  token_hash text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table time_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  store_id uuid not null references stores(id),
  type time_record_type not null,
  recorded_at timestamptz not null default now(),
  device_id uuid references kiosk_devices(id),
  source time_record_source not null default 'kiosk',
  correction_of uuid references time_records(id),
  correction_reason text,
  corrected_by uuid references staff(id),
  created_at timestamptz not null default now()
);

create table attendance_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  store_id uuid not null references stores(id),
  date date not null,
  shift_id uuid references shifts(id),
  clock_in timestamptz,
  clock_out timestamptz,
  break_minutes integer not null default 0,
  work_minutes integer not null default 0,
  late_minutes integer not null default 0,
  early_leave_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  is_missing_clock boolean not null default false,
  status attendance_day_status not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, date)
);

create table payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  target_month date not null,
  status payroll_period_status not null default 'open',
  locked_by uuid references staff(id),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, target_month)
);

create table payroll_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  period_id uuid not null references payroll_periods(id),
  staff_id uuid not null references staff(id),
  work_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  base_amount integer not null default 0,
  overtime_amount integer not null default 0,
  commute_amount integer not null default 0,
  allowance_amount integer not null default 0,
  deduction_amount integer not null default 0,
  total_amount integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, staff_id)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  body text,
  scope_type scope_type not null default 'company',
  scope_id uuid,
  publish_from date,
  publish_to date,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table store_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  schedule_type_id uuid references schedule_types(id),
  title text not null,
  date date not null,
  start_time time,
  end_time time,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  kind text not null,
  severity suggestion_severity not null default 'info',
  store_id uuid references stores(id),
  staff_id uuid references staff(id),
  title text not null,
  body text,
  suggested_action jsonb,
  approval_status suggestion_approval not null default 'pending',
  execution_status suggestion_execution not null default 'not_executed',
  source text not null default 'rule',
  decided_by uuid references staff(id),
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  kind text not null,
  target_table text,
  target_id uuid,
  requested_by uuid references staff(id),
  status approval_status not null default 'pending',
  decided_by uuid references staff(id),
  decided_at timestamptz,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table integration_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  kind text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index on shift_requests (company_id, period_id, date);
create index on shift_requests (staff_id, date);
create index on shifts (company_id, store_id, date);
create index on shifts (staff_id, date);
create index on time_records (company_id, staff_id, recorded_at desc);
create index on attendance_days (company_id, store_id, date);
create index on payroll_items (company_id, period_id);
create index on announcements (company_id, publish_from);
create index on store_events (company_id, store_id, date);
create index on notifications (staff_id, created_at desc);
create index on ai_suggestions (company_id, approval_status, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['shift_request_periods','shift_requests','shifts','kiosk_devices','attendance_days','payroll_periods','payroll_items','announcements','store_events','ai_suggestions','approval_requests','integration_configs']
  loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['shift_request_periods','shift_requests','shifts','kiosk_devices','time_records','attendance_days','payroll_periods','payroll_items','announcements','store_events','notifications','ai_suggestions','approval_requests','integration_configs']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach t in array array['shift_request_periods','shift_requests','shifts','time_records','attendance_days','announcements','store_events','ai_suggestions','approval_requests']
  loop
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
  end loop;
  foreach t in array array['shift_request_periods','shift_requests','shifts','announcements','store_events','ai_suggestions','approval_requests']
  loop
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

create policy payroll_select_self on payroll_items for select to authenticated
  using (
    company_id = app.current_company_id()
    and staff_id = (select id from staff where auth_user_id = auth.uid() limit 1)
  );

create policy notif_select_self on notifications for select to authenticated
  using (staff_id = (select id from staff where auth_user_id = auth.uid() limit 1));
create policy notif_update_self on notifications for update to authenticated
  using (staff_id = (select id from staff where auth_user_id = auth.uid() limit 1));

create policy kiosk_select on kiosk_devices for select to authenticated
  using (company_id = app.current_company_id());
