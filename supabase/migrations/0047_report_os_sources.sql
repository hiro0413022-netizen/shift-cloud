-- 0047_report_os_sources.sql
-- Report OS（月次資料 自動生成）の未整備データソースを整備する。
--   1) rpt_retail_sales        : 物販売上の月次記録（レジ/売上CSV由来。将来 Money OS 接続）
--   2) rpt_member_snapshots    : 会員数（正会員ルール）の月次スナップショット蓄積
--   3) report_member_counts()  : 指定月の正会員数・新規/退会・除外内訳を返す（SYSTEM.md §4-A）
--   4) snapshot_member_count() : 上記を rpt_member_snapshots に積む（月初スケジュール実行）
--   5) v_rpt_monthly           : 月次集計ビュー（会員数・物販・体験・フィッティング・入会率）
-- 規約: DATABASE_STANDARD.md（共通カラム / RLS: company_id = app.current_company_id()）

-- ------------------------------------------------------------------
-- 1) 物販売上（月次）
-- ------------------------------------------------------------------
create table if not exists rpt_retail_sales (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_code text,                        -- 例: takarazuka（GOLF WING）
  ym         date not null,               -- 対象月の1日
  amount     integer not null,            -- 税込・円（DATABASE_STANDARD: 金額はinteger）
  source     text not null default 'manual', -- 'sales_xlsx' | 'money_os' | 'manual'
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists rpt_retail_sales_uk
  on rpt_retail_sales (company_id, coalesce(store_code, ''), ym) where deleted_at is null;

-- ------------------------------------------------------------------
-- 2) 会員数スナップショット（正会員ルール）
-- ------------------------------------------------------------------
create table if not exists rpt_member_snapshots (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  ym         date not null,               -- 対象月の1日（月末時点の在籍を表す）
  members    integer not null,            -- 正会員数（除外4区分を除く）
  new_joins  integer not null default 0,
  leavers    integer not null default 0,
  excluded_counts jsonb not null default '{}'::jsonb, -- 除外区分の内訳 {"スタッフ":15,...}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists rpt_member_snapshots_uk
  on rpt_member_snapshots (company_id, ym) where deleted_at is null;

-- updated_at トリガ（既存の共通関数 app.set_updated_at を利用）
drop trigger if exists trg_rpt_retail_sales_updated on rpt_retail_sales;
create trigger trg_rpt_retail_sales_updated before update on rpt_retail_sales
  for each row execute function app.set_updated_at();
drop trigger if exists trg_rpt_member_snapshots_updated on rpt_member_snapshots;
create trigger trg_rpt_member_snapshots_updated before update on rpt_member_snapshots
  for each row execute function app.set_updated_at();

-- RLS
alter table rpt_retail_sales     enable row level security;
alter table rpt_member_snapshots enable row level security;

drop policy if exists rpt_retail_sales_tenant on rpt_retail_sales;
create policy rpt_retail_sales_tenant on rpt_retail_sales
  for all using (company_id = app.current_company_id())
  with check (company_id = app.current_company_id());

drop policy if exists rpt_member_snapshots_tenant on rpt_member_snapshots;
create policy rpt_member_snapshots_tenant on rpt_member_snapshots
  for all using (company_id = app.current_company_id())
  with check (company_id = app.current_company_id());

-- ------------------------------------------------------------------
-- 3) 正会員カウント（SYSTEM.md §4-A の正典実装）
--    除外4区分＝スタッフ / モニター会員 / 法人会員2枚目 / トライアル会員
--    当月末退会者は当月の会員数に含めない（leave_date <= 月末 は在籍外）
-- ------------------------------------------------------------------
create or replace function report_member_counts(p_company_id uuid, p_ym date)
returns table (
  ym date, members integer, new_joins integer, leavers integer, excluded jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select date_trunc('month', p_ym)::date                                as m_start,
           (date_trunc('month', p_ym) + interval '1 month')::date         as m_next,
           (date_trunc('month', p_ym) + interval '1 month - 1 day')::date as m_end
  ),
  ex as (select array['スタッフ','モニター会員','法人会員2枚目','トライアル会員'] as types)
  select
    p.m_start as ym,
    (select count(*) from mbr_members m, ex
      where m.company_id = p_company_id
        
        and not (m.member_type = any (ex.types))
        and m.join_date <= p.m_end
        and (m.leave_date is null or m.leave_date > p.m_end))::int as members,
    (select count(*) from mbr_members m
      where m.company_id = p_company_id 
        and m.join_date >= p.m_start and m.join_date < p.m_next)::int as new_joins,
    (select count(*) from mbr_members m
      where m.company_id = p_company_id 
        and m.leave_date >= p.m_start and m.leave_date < p.m_next)::int as leavers,
    coalesce((
      select jsonb_object_agg(t.member_type, t.c) from (
        select m.member_type, count(*) c
        from mbr_members m, ex
        where m.company_id = p_company_id 
          and m.member_type = any (ex.types)
          and m.join_date <= p.m_end
          and (m.leave_date is null or m.leave_date > p.m_end)
        group by m.member_type
      ) t), '{}'::jsonb) as excluded
  from p;
$$;

-- ------------------------------------------------------------------
-- 4) 月次スナップショットを積む（月初に前月分を実行）
-- ------------------------------------------------------------------
create or replace function snapshot_member_count(p_company_id uuid, p_ym date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select * into r from report_member_counts(p_company_id, p_ym);
  insert into rpt_member_snapshots (company_id, ym, members, new_joins, leavers, excluded_counts)
  values (p_company_id, r.ym, r.members, r.new_joins, r.leavers, r.excluded)
  on conflict (company_id, ym) where deleted_at is null
  do update set members         = excluded.members,
                new_joins       = excluded.new_joins,
                leavers         = excluded.leavers,
                excluded_counts = excluded.excluded_counts,
                updated_at      = now();
end $$;

-- ------------------------------------------------------------------
-- 5) 月次集計ビュー（report-os build-data がこれ1本を読む）
--    体験/フィッティングは mbr_walkin_visits が正（予約一覧はキャンセル未削除で不正確）
--    入会率＝当月入会数(mbr_members.join_date) ÷ 当月体験数(walkin trial)
-- ------------------------------------------------------------------
create or replace view v_rpt_monthly with (security_invoker = true) as
with months as (
  select distinct date_trunc('month', d)::date as ym, company_id
  from (
    select visited_on as d, company_id from mbr_walkin_visits where deleted_at is null
    union all select join_date, company_id from mbr_members where join_date is not null
    union all select ym, company_id from rpt_retail_sales where deleted_at is null
  ) s
)
select
  mo.company_id,
  mo.ym,
  (select members   from report_member_counts(mo.company_id, mo.ym))                       as members,
  (select new_joins from report_member_counts(mo.company_id, mo.ym))                       as new_joins,
  (select leavers   from report_member_counts(mo.company_id, mo.ym))                       as leavers,
  coalesce((select sum(r.amount)::int from rpt_retail_sales r
            where r.company_id = mo.company_id and r.ym = mo.ym and r.deleted_at is null), null) as retail_sales,
  (select count(*) from mbr_walkin_visits w
     where w.company_id = mo.company_id and w.deleted_at is null and w.visit_type = 'fitting'
       and w.visited_on >= mo.ym and w.visited_on < (mo.ym + interval '1 month'))::int      as fittings,
  (select count(*) from mbr_walkin_visits w
     where w.company_id = mo.company_id and w.deleted_at is null and w.visit_type = 'trial'
       and w.visited_on >= mo.ym and w.visited_on < (mo.ym + interval '1 month'))::int      as trials
from months mo;

comment on view v_rpt_monthly is 'Report OS 月次集計。会員数は正会員ルール(SYSTEM.md §4-A)、体験/フィッティングは一時利用者名簿(mbr_walkin_visits)が正、物販は rpt_retail_sales。';
