-- 0168_craft_os_fitting_split.sql
-- 表紙（フィッティング記録）を伝票から切り離す。
--
-- なぜ:
--   表紙はフィッティング時にお客様へお渡しする紙。伝票（見積／注文）とは別物で、
--   グリップ交換だけのときは表紙が存在しない。逆に1回のフィッティングから
--   伝票が複数に分かれることもある（ドライバーは今日、アイアンは後日）。
--   これまでは伝票が親で表紙がその子だったため、どちらのケースも表現できなかった。
--
-- 決めたこと:
--   ・表紙 gw_fittings を独立させ、試打の行は表紙にぶら下げる
--   ・伝票 gw_quotes.fitting_id は NULL 可（表紙なしの伝票が作れる）
--   ・フィッティング料の返金上限は「表紙ごと」に数える（伝票を分けても二重に返さない）
--   ・番号は年ごとの通し。表紙 F26-0001 / 伝票 26-0001

begin;

-- ── 1. 表紙 ────────────────────────────────────────────────────────────
create table if not exists public.gw_fittings (
  id                bigserial primary key,
  company_id        uuid not null,
  store_id          uuid references public.stores(id),
  seq_year          int  not null,
  fitting_seq       int  not null,
  fitting_no        text not null,

  guest_id          uuid references public.mbr_guests(id),
  customer_name     text not null,
  customer_contact  text,
  member_kind       text not null default 'ビジター',
  segment           text not null default 'visitor_no_fitting',
  walkin_visit_id   uuid references public.mbr_walkin_visits(id),
  res_request_id    uuid references public.res_requests(id),

  fitting_date      date not null default current_date,
  fitter_staff_id   uuid references public.staff(id),
  fitter_name       text,
  fitting_menu      text,
  fitting_minutes   int,

  note              text,
  status            text not null default 'open',
  created_by        uuid references public.staff(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint fittings_seq_uniq      unique (company_id, seq_year, fitting_seq),
  constraint fittings_no_uniq       unique (company_id, fitting_no),
  constraint fittings_member_kind_check check (member_kind in ('会員','ビジター','スタッフ')),
  constraint fittings_segment_check     check (segment in ('visitor_no_fitting','visitor_or_intro','member_paid_fitting','from_demo_or_lesson')),
  constraint fittings_minutes_check     check (fitting_minutes is null or fitting_minutes in (55,110)),
  constraint fittings_status_check      check (status in ('open','quoted','closed','void'))
);

create index if not exists gw_fittings_company_date_idx on public.gw_fittings (company_id, fitting_date desc);
create index if not exists gw_fittings_guest_idx        on public.gw_fittings (guest_id);

alter table public.gw_fittings enable row level security;
drop policy if exists tenant_select on public.gw_fittings;
drop policy if exists tenant_insert on public.gw_fittings;
drop policy if exists tenant_update on public.gw_fittings;
drop policy if exists tenant_delete on public.gw_fittings;
create policy tenant_select on public.gw_fittings for select using (company_id = app.current_company_id());
create policy tenant_insert on public.gw_fittings for insert with check (company_id = app.current_company_id());
create policy tenant_update on public.gw_fittings for update using (company_id = app.current_company_id());
create policy tenant_delete on public.gw_fittings for delete using (company_id = app.current_company_id());

-- ── 2. 伝票に表紙への任意リンクと年を足す ──────────────────────────────
alter table public.gw_quotes
  add column if not exists fitting_id      bigint references public.gw_fittings(id) on delete set null,
  add column if not exists seq_year        int,
  add column if not exists quote_issued_at timestamptz;

comment on column public.gw_quotes.fitting_id      is '表紙。NULL＝フィッティングを伴わない伝票（グリップ交換だけ等）';
comment on column public.gw_quotes.quote_issued_at is '御見積書を発行した日時。NULL＝注文書だけで完結した伝票';

create index if not exists gw_quotes_fitting_idx on public.gw_quotes (fitting_id);

-- ── 3. 既存の伝票から表紙を起こす（フィッティング情報か試打の行があるものだけ）─
alter table public.gw_fittings add column if not exists source_quote_id bigint;

insert into public.gw_fittings (
  company_id, store_id, seq_year, fitting_seq, fitting_no,
  guest_id, customer_name, customer_contact, member_kind, segment,
  walkin_visit_id, res_request_id,
  fitting_date, fitter_staff_id, fitter_name, fitting_menu, fitting_minutes,
  status, created_by, created_at, source_quote_id
)
select company_id, store_id, yr, rn,
       'F' || to_char(yr % 100, 'FM00') || '-' || to_char(rn, 'FM0000'),
       guest_id, customer_name, customer_contact, member_kind, segment,
       walkin_visit_id, res_request_id,
       coalesce(fitting_date, quote_date), fitter_staff_id, fitter_name, fitting_menu, fitting_minutes,
       'quoted', created_by, created_at, id
from (
  select q.*,
         extract(year from coalesce(q.fitting_date, q.quote_date))::int as yr,
         row_number() over (
           partition by q.company_id, extract(year from coalesce(q.fitting_date, q.quote_date))::int
           order by q.id
         ) as rn
  from public.gw_quotes q
  where q.deleted_at is null
    and (q.fitting_date is not null
         or exists (select 1 from public.gw_fitting_trials t where t.quote_id = q.id))
) src;

update public.gw_quotes q
set fitting_id = f.id
from public.gw_fittings f
where f.source_quote_id = q.id;

alter table public.gw_fittings drop column source_quote_id;

-- ── 4. 試打の行を表紙にぶら下げ替える ─────────────────────────────────
alter table public.gw_fitting_trials
  add column if not exists fitting_id bigint references public.gw_fittings(id) on delete cascade;

update public.gw_fitting_trials t
set fitting_id = q.fitting_id
from public.gw_quotes q
where t.quote_id = q.id and q.fitting_id is not null;

-- 行き場のない試打行（表紙が起こせなかったもの）は残さない
delete from public.gw_fitting_trials where fitting_id is null;

alter table public.gw_fitting_trials drop constraint if exists gw_fitting_trials_line_uniq;
alter table public.gw_fitting_trials drop constraint if exists gw_fitting_trials_quote_id_fkey;
alter table public.gw_fitting_trials drop column if exists quote_id;
alter table public.gw_fitting_trials alter column fitting_id set not null;
alter table public.gw_fitting_trials add constraint gw_fitting_trials_line_uniq unique (fitting_id, line_no);

-- ── 5. 伝票からフィッティングの項目を落とす（正典は表紙に一本化）────────
alter table public.gw_quotes drop constraint if exists quotes_fitting_minutes_check;
alter table public.gw_quotes drop constraint if exists quotes_fitter_staff_id_fkey;
alter table public.gw_quotes
  drop column if exists fitting_date,
  drop column if exists fitter_staff_id,
  drop column if exists fitter_name,
  drop column if exists fitting_menu,
  drop column if exists fitting_minutes;

-- ── 6. 番号を年ごとの通しにする ───────────────────────────────────────
update public.gw_quotes set seq_year = extract(year from quote_date)::int where seq_year is null;

-- 既存の通し番号を、年ごとに振り直す（先に旧UNIQUEを外さないと途中で衝突しうる）
alter table public.gw_quotes drop constraint if exists quotes_seq_uniq;

with r as (
  select id, seq_year,
         row_number() over (partition by company_id, seq_year order by id) as rn
  from public.gw_quotes
)
update public.gw_quotes q
set quote_seq = r.rn,
    quote_no  = to_char(q.seq_year % 100, 'FM00') || '-' || to_char(r.rn, 'FM0000')
from r where r.id = q.id;

alter table public.gw_quotes alter column seq_year set not null;
alter table public.gw_quotes add constraint quotes_seq_uniq unique (company_id, seq_year, quote_seq);

-- ── 7. 採番関数 ───────────────────────────────────────────────────────
drop function if exists public.gw_next_quote_seq(uuid);

create or replace function public.gw_next_quote_seq(p_company uuid, p_year int)
returns int language sql security definer set search_path to 'public' as $fn$
  select coalesce(max(quote_seq), 0) + 1
  from public.gw_quotes
  where company_id = p_company and seq_year = p_year;
$fn$;

create or replace function public.gw_next_fitting_seq(p_company uuid, p_year int)
returns int language sql security definer set search_path to 'public' as $fn$
  select coalesce(max(fitting_seq), 0) + 1
  from public.gw_fittings
  where company_id = p_company and seq_year = p_year;
$fn$;

grant execute on function public.gw_next_quote_seq(uuid, int)   to authenticated, service_role;
grant execute on function public.gw_next_fitting_seq(uuid, int) to authenticated, service_role;

commit;
