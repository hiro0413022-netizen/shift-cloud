-- 0010_vision_kpis.sql
-- VISION §6「最重要KPI 5つ」の器を揃える（正典: docs/genesis/VISION.md）
-- 1.売上進捗=monthly_sales(0009接続済) 2.会員数=members 3.体験予約数・入会率 4.退会率 5.人件費率
-- 会員・予約系はCRM/予約モジュール接続まで手動更新（Command CenterのKPI更新フォーム）

do $$
declare
  v_company uuid;
begin
  select id into v_company from companies limit 1;

  insert into kpis (company_id, code, name, area, unit, current_value, target_value, period, trend, notes) values
    (v_company, 'trial_bookings', '体験予約数（当月）', 'members', '件', null, null, 'monthly', '[]', '手動更新（予約モジュール接続後に自動化）'),
    (v_company, 'conversion_rate', '入会率', 'members', '%', null, null, 'monthly', '[]', '手動更新（体験→入会。CRM接続後に自動化）'),
    (v_company, 'churn_rate', '退会率', 'members', '%', null, null, 'monthly', '[]', '手動更新（CRM接続後に自動化）'),
    (v_company, 'labor_cost_ratio', '人件費率', 'labor', '%', null, null, 'monthly', '[]', '財務実績（人件費÷売上）から自動算出')
  on conflict (company_id, code) do nothing;
end $$;

-- refresh_finance_kpis を拡張: 人件費率（人件費÷売上×100）を自動算出
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
  v_ratio_trend jsonb;
  v_ratio_current numeric;
begin
  if not exists (select 1 from fin_entries where company_id = p_company_id and deleted_at is null) then
    return;
  end if;

  with monthly as (
    select e.target_month as m,
           sum(e.amount) filter (where c.kind = 'revenue') as revenue,
           sum(e.amount) filter (where c.kind in ('cogs', 'expense')) as cost,
           sum(e.amount) filter (where c.code = 'labor') as labor
    from fin_entries e
    join fin_categories c on c.id = e.category_id
    where e.company_id = p_company_id and e.deleted_at is null
    group by 1 order by 1 desc limit 12
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', coalesce(revenue, 0)) order by m), '[]'::jsonb),
    coalesce((select revenue from monthly where m = date_trunc('month', current_date)::date), 0),
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', coalesce(revenue, 0) - coalesce(cost, 0)) order by m), '[]'::jsonb),
    coalesce((select coalesce(revenue, 0) - coalesce(cost, 0) from monthly where m = date_trunc('month', current_date)::date), 0),
    coalesce((select jsonb_agg(jsonb_build_object('date', m::text, 'value', round(labor / revenue * 100, 1)) order by m)
              from monthly where revenue > 0 and labor is not null), '[]'::jsonb),
    (select round(labor / revenue * 100, 1) from monthly
      where m = date_trunc('month', current_date)::date and revenue > 0 and labor is not null)
  into v_sales_trend, v_sales_current, v_profit_trend, v_profit_current, v_ratio_trend, v_ratio_current
  from monthly;

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

  if v_ratio_current is not null then
    update kpis set
      current_value = v_ratio_current,
      trend = v_ratio_trend,
      notes = '財務実績（人件費÷売上）から自動算出',
      updated_at = now(),
      deleted_at = null
    where company_id = p_company_id and code = 'labor_cost_ratio';
  end if;
end;
$$;

revoke execute on function refresh_finance_kpis(uuid) from public, anon, authenticated;
