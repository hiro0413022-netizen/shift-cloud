-- 適用済み: 2026-09-12（Supabase migration名 craft_os_fitting_trials）
-- フィッティング表紙の「試打したシャフト」11行。
-- 見積明細とは別に持つ：試した中から買うのは一部で、
-- 「何を試して何を選ばなかったか」自体が次回の材料になるため（紙の表紙がまさにそれ）。
create table if not exists public.gw_fitting_trials (
  id           bigserial primary key,
  company_id   uuid not null default app.current_company_id(),
  quote_id     bigint not null references public.gw_quotes(id) on delete cascade,
  line_no      integer not null,
  demo_no      integer,
  product_id   bigint references golfwing.products(id),
  head_name    text,
  memo         text,
  picked       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint gw_fitting_trials_line_uniq unique (quote_id, line_no)
);
create index if not exists gw_fitting_trials_quote_idx on public.gw_fitting_trials(quote_id);
create index if not exists gw_fitting_trials_demo_idx  on public.gw_fitting_trials(company_id, demo_no);

comment on table public.gw_fitting_trials is
  'フィッティング表紙の試打記録。買わなかったシャフトも残す（次回「前回これは合わなかった」が読める）';

alter table public.gw_fitting_trials enable row level security;
revoke all on public.gw_fitting_trials from anon;
grant select, insert, update, delete on public.gw_fitting_trials to authenticated;
grant all on public.gw_fitting_trials to service_role;
grant usage, select on sequence public.gw_fitting_trials_id_seq to authenticated, service_role;

create policy tenant_select on public.gw_fitting_trials for select to authenticated using (company_id = app.current_company_id());
create policy tenant_insert on public.gw_fitting_trials for insert to authenticated with check (company_id = app.current_company_id());
create policy tenant_update on public.gw_fitting_trials for update to authenticated using (company_id = app.current_company_id());
create policy tenant_delete on public.gw_fitting_trials for delete to authenticated using (company_id = app.current_company_id());
