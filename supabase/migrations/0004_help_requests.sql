-- 0004_help_requests: 出勤募集と応募
-- 適用済み: 2026-07-02 → yozan-shift-cloud (qrgpblnnhdudigarrtuz)
create type help_request_status as enum ('open','closed');
create type help_application_status as enum ('pending','accepted','rejected');

create table help_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  date date not null,
  start_time time not null,
  end_time time not null,
  needed_count integer not null default 1,
  note text,
  status help_request_status not null default 'open',
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table help_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  help_request_id uuid not null references help_requests(id),
  staff_id uuid not null references staff(id),
  status help_application_status not null default 'pending',
  decided_by uuid references staff(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (help_request_id, staff_id)
);

create index on help_requests (company_id, store_id, date);
create index on help_applications (company_id, help_request_id);

create trigger set_updated_at before update on help_requests for each row execute function app.set_updated_at();
create trigger set_updated_at before update on help_applications for each row execute function app.set_updated_at();

alter table help_requests enable row level security;
alter table help_applications enable row level security;

do $$
declare t text;
begin
  foreach t in array array['help_requests','help_applications']
  loop
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;
