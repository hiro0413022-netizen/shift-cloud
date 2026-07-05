-- 0009_finance.sql
-- 財務管理モジュール（事業別月次PL）: 税理士データの手入力＋CSV取込を前提としたMVP
-- DECISIONS #21: 会計ソフトAPI連携は後続。まず月次実績（fin_entries）を唯一の真実とする

-- ============================================================
-- 1. fin_segments — 事業セグメント（店舗より粗い単位）
-- ============================================================
create table fin_segments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name text not null,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

-- ============================================================
-- 2. fin_categories — 勘定科目カテゴリ
-- ============================================================
create table fin_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name text not null,
  kind text not null check (kind in ('revenue', 'cogs', 'expense')),
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

-- ============================================================
-- 3. fin_entries — 月次実績（セグメント×科目×月で1行）
-- ============================================================
create table fin_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  segment_id uuid not null references fin_segments(id),
  category_id uuid not null references fin_categories(id),
  target_month date not null, -- 月初日で正規化
  amount numeric not null default 0, -- 円。収益も費用も正の値で持ち、kindで判別
  memo text,
  source text not null default 'manual', -- manual / csv / shift_cloud
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, segment_id, category_id, target_month)
);
create index idx_fin_entries_month on fin_entries (company_id, target_month);

-- トリガー＋RLS（既存標準の流用）
do $$
declare
  t text;
begin
  foreach t in array array['fin_segments', 'fin_categories', 'fin_entries'] loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- ============================================================
-- 4. シード（事業セグメント / 勘定科目 / financeモジュール登録）
-- ============================================================
do $$
declare
  v_company uuid;
begin
  select id into v_company from companies limit 1;

  insert into fin_segments (company_id, code, name, sort_order) values
    (v_company, 'golf', 'ゴルフ事業（GOLF WING）', 10),
    (v_company, 'kallinos', 'KALLINOS（アパレル）', 20),
    (v_company, 'caddy', 'キャディ派遣', 30),
    (v_company, 'rac', 'RAC運営', 40),
    (v_company, 'hq', '本部・共通', 90)
  on conflict do nothing;

  insert into fin_categories (company_id, code, name, kind, sort_order) values
    (v_company, 'sales', '売上高', 'revenue', 10),
    (v_company, 'other_income', 'その他収入', 'revenue', 20),
    (v_company, 'cogs', '売上原価（仕入）', 'cogs', 30),
    (v_company, 'labor', '人件費', 'expense', 40),
    (v_company, 'rent', '地代家賃', 'expense', 50),
    (v_company, 'utility', '水道光熱費', 'expense', 60),
    (v_company, 'ad', '広告宣伝費', 'expense', 70),
    (v_company, 'supplies', '消耗品・備品', 'expense', 80),
    (v_company, 'outsourcing', '外注費', 'expense', 90),
    (v_company, 'other_expense', 'その他経費', 'expense', 100)
  on conflict do nothing;

  insert into modules (company_id, code, name, description, status, sort_order)
  values (v_company, 'finance', '財務管理', '事業別月次PL・KPI連携（税理士データ手入力＋CSV取込。会計ソフトAPIは後続）', 'live', 35)
  on conflict (company_id, code) do update set status = 'live', description = excluded.description;
end $$;

-- ============================================================
-- 5. refresh_finance_kpis — fin_entries → kpis（月次売上・営業利益）
-- ============================================================
create or replace function refresh_finance_kpis(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales_trend jsonb;
  v_sales_current numeric;
  v_profit_trend jsonb;
  v_profit_current numeric;
begin
  -- 月次売上（revenue合計）
  with monthly as (
    select e.target_month as m,
           sum(e.amount) filter (where c.kind = 'revenue') as revenue,
           sum(e.amount) filter (where c.kind in ('cogs', 'expense')) as cost
    from fin_entries e
    join fin_categories c on c.id = e.category_id
    where e.company_id = p_company_id and e.deleted_at is null
    group by 1 order by 1 desc limit 12
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', coalesce(revenue, 0)) order by m), '[]'::jsonb),
    coalesce((select revenue from monthly where m = date_trunc('month', current_date)::date), 0),
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', coalesce(revenue, 0) - coalesce(cost, 0)) order by m), '[]'::jsonb),
    coalesce((select coalesce(revenue, 0) - coalesce(cost, 0) from monthly where m = date_trunc('month', current_date)::date), 0)
  into v_sales_trend, v_sales_current, v_profit_trend, v_profit_current
  from monthly;

  -- データが1件もない場合は未接続のまま維持
  if not exists (select 1 from fin_entries where company_id = p_company_id and deleted_at is null) then
    return;
  end if;

  update kpis set
    current_value = v_sales_current,
    trend = v_sales_trend,
    notes = '財務管理モジュール（fin_entries）から自動集計',
    updated_at = now(),
    deleted_at = null
  where company_id = p_company_id and code = 'monthly_sales';

  insert into kpis (company_id, code, name, area, unit, current_value, period, trend, notes)
  values (p_company_id, 'operating_profit', '営業利益（当月）', 'sales', '円', v_profit_current, 'monthly',
          v_profit_trend, '財務管理モジュール（fin_entries）から自動集計')
  on conflict (company_id, code) do update set
    current_value = excluded.current_value,
    trend = excluded.trend,
    notes = excluded.notes,
    updated_at = now(),
    deleted_at = null;
end;
$$;

comment on function refresh_finance_kpis(uuid) is
  '財務実績（fin_entries）から月次売上・営業利益KPIを再集計。Finance画面の保存時と日次レポート生成時に呼ばれる';

revoke execute on function refresh_finance_kpis(uuid) from public, anon, authenticated;
