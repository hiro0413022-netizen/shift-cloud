-- 0008_kpi_real_data.sql
-- KPI実データ接続: Shift Cloud（勤怠・給与・スタッフ）→ kpis を自動集計する関数
-- 呼び出し: Genesis app（service_role）から rpc('refresh_shift_cloud_kpis', {p_company_id})
-- 方針: 給与確定月は payroll_items 実績、未確定月は 勤怠work_minutes×時給 の概算（全スタッフ時給制前提、月給制は対象外）

create or replace function refresh_shift_cloud_kpis(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_count numeric;
  v_work_hours_trend jsonb;
  v_work_hours_current numeric;
  v_labor_trend jsonb;
  v_labor_current numeric;
begin
  -- ============================================================
  -- 1. active_staff — 在籍スタッフ数（日次スナップショットをtrendに蓄積）
  -- ============================================================
  select count(*) into v_staff_count
  from staff where company_id = p_company_id and deleted_at is null;

  insert into kpis (company_id, code, name, area, unit, current_value, period, trend, notes)
  values (p_company_id, 'active_staff', '在籍スタッフ数', 'labor', '人', v_staff_count, 'daily',
          jsonb_build_array(jsonb_build_object('date', current_date::text, 'value', v_staff_count)),
          'Shift Cloud staffから自動集計')
  on conflict (company_id, code) do update set
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

  -- ============================================================
  -- 2. work_hours — 月次総労働時間（attendance_daysから全trend再計算）
  -- ============================================================
  with monthly as (
    select date_trunc('month', date)::date as m,
           round(sum(work_minutes) / 60.0, 1) as v
    from attendance_days
    where company_id = p_company_id
    group by 1 order by 1 desc limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', v) order by m), '[]'::jsonb),
         coalesce((select v from monthly where m = date_trunc('month', current_date)::date), 0)
  into v_work_hours_trend, v_work_hours_current
  from monthly;

  insert into kpis (company_id, code, name, area, unit, current_value, period, trend, notes)
  values (p_company_id, 'work_hours', '総労働時間（当月）', 'labor', 'h', v_work_hours_current, 'monthly',
          v_work_hours_trend, 'Shift Cloud attendance_daysから自動集計')
  on conflict (company_id, code) do update set
    current_value = excluded.current_value,
    trend = excluded.trend,
    notes = excluded.notes,
    updated_at = now(),
    deleted_at = null;

  -- ============================================================
  -- 3. labor_cost — 人件費（実績=payroll_items、未確定月=勤怠×時給の概算）
  -- ============================================================
  with payroll_actual as (
    select date_trunc('month', pp.target_month)::date as m,
           sum(pi.total_amount)::numeric as v
    from payroll_items pi
    join payroll_periods pp on pp.id = pi.period_id
    where pi.company_id = p_company_id
    group by 1
  ),
  attendance_estimate as (
    select date_trunc('month', ad.date)::date as m,
           round(sum(ad.work_minutes / 60.0 * coalesce(w.hourly_wage, 0)))::numeric as v
    from attendance_days ad
    left join lateral (
      select hourly_wage from staff_wages sw
      where sw.staff_id = ad.staff_id and sw.deleted_at is null and sw.effective_from <= ad.date
      order by sw.effective_from desc limit 1
    ) w on true
    where ad.company_id = p_company_id
    group by 1
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
    notes = '実績=payroll_items確定分、未確定月=勤怠×時給の概算（Shift Cloudから自動集計）',
    updated_at = now(),
    deleted_at = null
  where company_id = p_company_id and code = 'labor_cost';
end;
$$;

comment on function refresh_shift_cloud_kpis(uuid) is
  'Shift Cloud実データ（staff/attendance_days/payroll_items/staff_wages）からkpisを再集計。Genesis appのKPI更新・日次レポート生成時に呼ばれる';

-- service_roleのみ実行可（RLS外のsecurity definerのため一般ロールから遮断）
revoke execute on function refresh_shift_cloud_kpis(uuid) from public, anon, authenticated;
