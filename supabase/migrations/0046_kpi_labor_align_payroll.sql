-- 0046_kpi_labor_align_payroll.sql
-- GENESISのKPI「総労働時間」「人件費」を給与計算と同じ基準に揃える（DECISIONS #53）
--
-- 【直すバグ】0008 の refresh_shift_cloud_kpis は Shift Cloud の /hq と同じ独自計算だった:
--   (a) 日次15分丸め（companies.settings.rounding_minutes）を掛けていない
--       → 総労働時間が過大（2026-07: 102.6h → 正 100.75h）
--   (b) 月給者（staff_wages.wage_type='monthly'）を「時給0円」として扱う
--       → 人件費に月給が入らない（2026-07: ¥256,208 → 正 ¥333,982。古川さんの月給80,000が消えていた）
--   (c) 交通費（commute_allowance × 出勤日数）が入らない
--
-- 【方針】金額ロジックの正典は apps/shift-cloud/src/lib/payroll-calc.ts（TS）。
--   給与を集計済みの月は payroll_items（＝TSで計算した実績）をそのまま使うのが正。
--   未集計の月だけ、この関数がSQLで「同じ式」の概算を出す。SQLとTSの二重実装は
--   tests/labor-summary.test.ts と scripts/check-labor-logic.mjs で監視する。

create or replace function refresh_shift_cloud_kpis(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_count numeric;
  v_rounding integer;
  v_work_hours_trend jsonb;
  v_work_hours_current numeric;
  v_labor_trend jsonb;
  v_labor_current numeric;
begin
  -- 丸め単位（会社設定。0なら丸めなし）
  select coalesce((settings->>'rounding_minutes')::int, 0) into v_rounding
  from companies where id = p_company_id;

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
  -- 2. work_hours — 月次総労働時間（★日次15分丸め後。給与計算と同基準）
  -- ============================================================
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
  on conflict (company_id, code) do update set
    current_value = excluded.current_value,
    trend = excluded.trend,
    notes = excluded.notes,
    updated_at = now(),
    deleted_at = null;

  -- ============================================================
  -- 3. labor_cost — 人件費
  --    実績 = payroll_items（給与集計済みの月／TSの正典ロジックの結果）
  --    概算 = 時給者(丸め後実働×時給 + 交通費日額×出勤日数) + 月給者(月給固定)
  -- ============================================================
  with payroll_actual as (
    select date_trunc('month', pp.target_month)::date as m,
           sum(pi.total_amount)::numeric as v
    from payroll_items pi
    join payroll_periods pp on pp.id = pi.period_id
    where pi.company_id = p_company_id
    group by 1
  ),
  -- 日ごとに「その日に有効な賃金」を引く（月中の時給変更に対応 / DECISIONS #39）
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
    -- 時給者のみ: 丸め後実働×時給 ＋ 交通費日額×出勤日数
    select m,
           sum(floor(wm / 60.0 * hourly_wage)) + sum(case when worked then commute_allowance else 0 end) as v
    from day_wage where wage_type = 'hourly'
    group by 1
  ),
  months as (
    select distinct m from day_wage
  ),
  monthly_est as (
    -- 月給者: 勤怠に関係なく月給を固定計上（勤怠0日でも支給される / DECISIONS #44）
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
$$;

comment on function refresh_shift_cloud_kpis(uuid) is
  'Shift Cloud実データからkpisを再集計。労働時間・人件費は給与計算（payroll-calc.ts）と同基準＝日次丸め・月給・交通費を反映（DECISIONS #53）';

revoke execute on function refresh_shift_cloud_kpis(uuid) from public, anon, authenticated;
