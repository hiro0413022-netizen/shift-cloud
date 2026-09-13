-- 0162_shift_cloud_kpis_upsert_fix.sql
-- 0161 と同じ 0112 起因の upsert 不整合（42P10）を refresh_shift_cloud_kpis にも適用（#237）。
-- 在籍スタッフ数・総労働時間のKPIが 2026-08-22 以降ずっと更新できていなかった。
-- 変更点は on conflict の述語 `where store_id is null` の追加のみ（中身のロジックは据え置き）。
create or replace function refresh_shift_cloud_kpis(p_company_id uuid)
returns void language plpgsql security definer set search_path = public as $function$
declare
  v_staff_count numeric;
  v_rounding integer;
  v_work_hours_trend jsonb;
  v_work_hours_current numeric;
  v_labor_trend jsonb;
  v_labor_current numeric;
begin
  select coalesce((settings->>'rounding_minutes')::int, 0) into v_rounding
  from companies where id = p_company_id;

  select count(*) into v_staff_count
  from staff where company_id = p_company_id and deleted_at is null;

  insert into kpis (company_id, code, name, area, unit, current_value, period, trend, notes)
  values (p_company_id, 'active_staff', '在籍スタッフ数', 'labor', '人', v_staff_count, 'daily',
          jsonb_build_array(jsonb_build_object('date', current_date::text, 'value', v_staff_count)),
          'Shift Cloud staffから自動集計')
  on conflict (company_id, code) where store_id is null do update set
    current_value = excluded.current_value,
    trend = (
      select coalesce(jsonb_agg(e order by e->>'date'), '[]'::jsonb)
      from (
        select e from jsonb_array_elements(kpis.trend) e
        where e->>'date' <> current_date::text
        order by e->>'date' desc limit 89
      ) t
    ) || jsonb_build_array(jsonb_build_object('date', current_date::text, 'value', v_staff_count)),
    notes = 'Shift Cloud staffから自動集計',
    updated_at = now(),
    deleted_at = null;

  with rounded as (
    select date_trunc('month', date)::date as m,
           case when v_rounding > 0
                then floor(work_minutes::numeric / v_rounding) * v_rounding
                else work_minutes end as wm
    from attendance_days
    where company_id = p_company_id
  ),
  monthly as (
    select m, round(sum(wm) / 60.0, 2) as v
    from rounded group by 1 order by 1 desc limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', v) order by m), '[]'::jsonb),
         coalesce((select v from monthly where m = date_trunc('month', current_date)::date), 0)
  into v_work_hours_trend, v_work_hours_current
  from monthly;

  insert into kpis (company_id, code, name, area, unit, current_value, period, trend, notes)
  values (p_company_id, 'work_hours', '総労働時間（当月）', 'labor', 'h', v_work_hours_current, 'monthly',
          v_work_hours_trend, 'Shift Cloud attendance_daysから自動集計（休憩控除後・日次丸め後）')
  on conflict (company_id, code) where store_id is null do update set
    current_value = excluded.current_value,
    trend = excluded.trend,
    notes = excluded.notes,
    updated_at = now(),
    deleted_at = null;

  with payroll_actual as (
    select date_trunc('month', pp.target_month)::date as m,
           sum(pi.total_amount)::numeric as v
    from payroll_items pi
    join payroll_periods pp on pp.id = pi.period_id
    where pi.company_id = p_company_id
    group by 1
  ),
  day_wage as (
    select date_trunc('month', ad.date)::date as m,
           ad.staff_id,
           case when v_rounding > 0
                then floor(ad.work_minutes::numeric / v_rounding) * v_rounding
                else ad.work_minutes end as wm,
           (ad.work_minutes > 0) as worked,
           coalesce(w.wage_type::text, 'hourly') as wage_type,
           coalesce(w.hourly_wage, 0) as hourly_wage,
           coalesce(w.commute_allowance, 0) as commute_allowance
    from attendance_days ad
    left join lateral (
      select sw.wage_type, sw.hourly_wage, sw.commute_allowance
      from staff_wages sw
      where sw.staff_id = ad.staff_id and sw.deleted_at is null and sw.effective_from <= ad.date
      order by sw.effective_from desc limit 1
    ) w on true
    where ad.company_id = p_company_id
  ),
  hourly_est as (
    select m,
           sum(floor(wm / 60.0 * hourly_wage)) + sum(case when worked then commute_allowance else 0 end) as v
    from day_wage where wage_type = 'hourly'
    group by 1
  ),
  months as (
    select distinct m from day_wage
  ),
  monthly_est as (
    select mo.m, coalesce(sum(sw.monthly_salary), 0)::numeric as v
    from months mo
    left join lateral (
      select distinct on (s.id) sw2.monthly_salary
      from staff s
      join staff_wages sw2 on sw2.staff_id = s.id and sw2.deleted_at is null
        and sw2.effective_from <= (mo.m + interval '1 month - 1 day')::date
      where s.company_id = p_company_id and s.deleted_at is null and sw2.wage_type = 'monthly'
      order by s.id, sw2.effective_from desc
    ) sw on true
    group by 1
  ),
  attendance_estimate as (
    select mo.m, coalesce(h.v, 0) + coalesce(mm.v, 0) as v
    from months mo
    left join hourly_est h on h.m = mo.m
    left join monthly_est mm on mm.m = mo.m
  ),
  merged as (
    select coalesce(pa.m, ae.m) as m,
           coalesce(pa.v, ae.v) as v,
           (pa.m is not null) as is_actual
    from payroll_actual pa
    full outer join attendance_estimate ae on ae.m = pa.m
    order by 1 desc limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', v, 'actual', is_actual) order by m), '[]'::jsonb),
         coalesce((select v from merged where m = date_trunc('month', current_date)::date), 0)
  into v_labor_trend, v_labor_current
  from merged;

  update kpis set
    current_value = v_labor_current,
    trend = v_labor_trend,
    notes = '実績=payroll_items確定分、未確定月=概算（日次丸め後実働×時給＋交通費＋月給者の月給）',
    updated_at = now(),
    deleted_at = null
  where company_id = p_company_id and code = 'labor_cost';
end;
$function$;
