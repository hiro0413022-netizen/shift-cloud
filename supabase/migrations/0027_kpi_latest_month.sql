-- 0027_kpi_latest_month.sql
-- 5大KPIのうち財務系（月次売上・営業利益・人件費率）のcurrent_valueを
-- 「当月(current_date)」→「売上のある最新実績月」基準に変更。
-- 当月未入力でも直近の実値が出るようにする（/finance の最新月初期表示と同じ考え方）。
-- ※本番へは 2026-07-06 に CREATE OR REPLACE で適用済み。

create or replace function public.refresh_finance_kpis(p_company_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_sales_trend jsonb; v_sales_current numeric;
  v_profit_trend jsonb; v_profit_current numeric;
  v_ratio_trend jsonb; v_ratio_current numeric;
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
    coalesce((select revenue from monthly where m = (select max(m) from monthly where coalesce(revenue,0) <> 0)), 0),
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', coalesce(revenue, 0) - coalesce(cost, 0)) order by m), '[]'::jsonb),
    coalesce((select coalesce(revenue, 0) - coalesce(cost, 0) from monthly where m = (select max(m) from monthly where coalesce(revenue,0) <> 0)), 0),
    coalesce((select jsonb_agg(jsonb_build_object('date', m::text, 'value', round(labor / revenue * 100, 1)) order by m)
              from monthly where revenue > 0 and labor is not null), '[]'::jsonb),
    (select round(labor / revenue * 100, 1) from monthly
      where m = (select max(m) from monthly where coalesce(revenue,0) <> 0) and revenue > 0 and labor is not null)
  into v_sales_trend, v_sales_current, v_profit_trend, v_profit_current, v_ratio_trend, v_ratio_current
  from monthly;

  update kpis set current_value = v_sales_current, trend = v_sales_trend,
    notes = '財務管理モジュール（fin_entries）から自動集計。値は最新実績月', updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'monthly_sales';

  insert into kpis (company_id, code, name, area, unit, current_value, period, trend, notes)
  values (p_company_id, 'operating_profit', '営業利益（最新月）', 'sales', '円', v_profit_current, 'monthly',
          v_profit_trend, '財務管理モジュール（fin_entries）から自動集計。値は最新実績月')
  on conflict (company_id, code) do update set
    current_value = excluded.current_value, trend = excluded.trend, notes = excluded.notes,
    updated_at = now(), deleted_at = null;

  if v_ratio_current is not null then
    update kpis set current_value = v_ratio_current, trend = v_ratio_trend,
      notes = '財務実績（人件費÷売上）から自動算出。値は最新実績月', updated_at = now(), deleted_at = null
    where company_id = p_company_id and code = 'labor_cost_ratio';
  end if;
end;
$function$;
