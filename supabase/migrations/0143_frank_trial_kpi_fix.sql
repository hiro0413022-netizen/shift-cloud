-- 0143: 当月体験人数と入会率の数え方を直す（#204 / 2026-09-03・本番適用済み）
--
-- ユーザー報告「当月体験人数と入会率の数字がおかしい」。実測すると2つ壊れていた。
--
-- ① 体験人数に **まだ来ていない予約** が混ざっていた
--    FRANKは体験予約が入った瞬間に受付台帳へ行を作る（#139）。visited_on は予約日なので、
--    9/4以降の予約15件も「当月の体験」として数えていた（9月28件のうち来店済は13件）。
--    → 当月の件数は今までどおり出しつつ、**来店済（今日以前）とこれからを内訳で持つ**。
--
-- ② 入会率が必ず 0.0% だった
--    分子が受付台帳の result='join'（台帳で【入会】を押した行）だけだった。
--    FRANKの入会はWeb入会で frunk_members に入るので、**誰も押していない**。
--    実際には9月の体験から2名が入会済みなのに 0% と出ていた。
--    → 体験に来たお客様が会員台帳に居るかを **電話下10桁／メール** で照合して数える。
--      ・一般に公開しているプラン（public_signup）だけ＝スタッフ・テスト・モニターは除く
--      ・法人の利用者行は除く（corporate_parent_id）
--      ・入会日が体験日以降（体験より前からの会員を「体験から入会」と数えない）
--      ・照合は同じ店舗の会員に限る（FRANKの体験 ⇄ FRANKの会員）
--    従来の result='join'（GOLF WINGの名簿・台帳経路）も有効。どちらかが立てば入会。
--
-- ③ 入会率の分母は **来店済** にする
--    これから来る予約で割ると、予約が入るほど率が下がる＝実態と逆に動く数字になる。
--
-- 材料の計算は app.trial_kpi_monthly に1か所だけ置く（全店合算と店舗別で式が割れないように）。

create or replace function app.trial_kpi_monthly(p_company_id uuid, p_store_id uuid default null)
returns table (m date, trials bigint, done_cnt bigint, joined_cnt bigint)
language sql
security definer
set search_path = public
as $$
  with base as (
    select v.store_id,
           date_trunc('month', v.visited_on)::date as m,
           v.visited_on,
           v.result,
           right(app.digits(coalesce(g.phone, g.mobile, '')), 10) as ph,
           lower(nullif(btrim(coalesce(g.email, '')), '')) as em
      from mbr_walkin_visits v
      left join mbr_guests g on g.id = v.guest_id
     where v.company_id = p_company_id
       and v.deleted_at is null
       and v.visit_type = 'trial'
       and (p_store_id is null or v.store_id = p_store_id)
  ),
  flagged as (
    select b.m,
           (b.visited_on <= current_date) as done,
           (b.result = 'join'
            or exists (
                 select 1
                   from frunk_members fm
                   join frunk_plans fp on fp.id = fm.plan_id
                  where fm.company_id = p_company_id
                    and fm.deleted_at is null
                    and fm.store_id = b.store_id
                    and fm.member_no is not null
                    and fm.corporate_parent_id is null
                    and coalesce(fp.public_signup, false)
                    and not coalesce(fp.is_corporate, false)
                    and fm.join_date >= b.visited_on
                    and ((b.ph <> '' and right(app.digits(coalesce(fm.phone, '')), 10) = b.ph)
                      or (b.em is not null and lower(coalesce(fm.email, '')) = b.em))
               )) as joined
      from base b
  )
  select m, count(*) as trials,
         count(*) filter (where done) as done_cnt,
         count(*) filter (where done and joined) as joined_cnt
    from flagged group by m
$$;

comment on function app.trial_kpi_monthly(uuid, uuid) is
  '体験KPIの材料（#204）。done=来店済（visited_on<=今日）。joined=台帳の【入会】または会員台帳との照合（電話下10桁/メール・同店・一般プラン・入会日>=体験日）';

grant execute on function app.trial_kpi_monthly(uuid, uuid) to service_role;

create or replace function refresh_member_kpis(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
  v_trial_trend jsonb; v_trial_current numeric; v_conv_trend jsonb; v_conv_current numeric;
  v_done int; v_joined int; v_future int;
  v_use_walkin boolean; v_store record;
begin
  v_use_walkin := exists (select 1 from mbr_walkin_visits where company_id = p_company_id and deleted_at is null);

  if v_use_walkin then
    -- ===== 全店合算 =====
    select
      coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', trials) order by m), '[]'::jsonb),
      coalesce((select trials from app.trial_kpi_monthly(p_company_id) where m = v_month_start), 0),
      coalesce(jsonb_agg(jsonb_build_object('date', m::text,
        'value', case when done_cnt > 0 then round(joined_cnt::numeric / done_cnt * 100, 1) else 0 end) order by m), '[]'::jsonb),
      (select case when done_cnt > 0 then round(joined_cnt::numeric / done_cnt * 100, 1) else null end
         from app.trial_kpi_monthly(p_company_id) where m = v_month_start),
      coalesce((select done_cnt from app.trial_kpi_monthly(p_company_id) where m = v_month_start), 0),
      coalesce((select joined_cnt from app.trial_kpi_monthly(p_company_id) where m = v_month_start), 0)
    into v_trial_trend, v_trial_current, v_conv_trend, v_conv_current, v_done, v_joined
    from app.trial_kpi_monthly(p_company_id);

    v_future := greatest(0, coalesce(v_trial_current, 0)::int - coalesce(v_done, 0));

    update kpis set
      name = '体験人数（当月）',
      current_value = v_trial_current, trend = v_trial_trend,
      notes = format('受付台帳の体験件数／全店合算。内訳: 来店済 %s件・これから %s件', v_done, v_future),
      updated_at = now(), deleted_at = null
    where company_id = p_company_id and code = 'trial_bookings' and store_id is null;

    update kpis set
      current_value = v_conv_current, trend = v_conv_trend,
      notes = format('来店済の体験 %s名のうち %s名が入会／全店合算。入会は会員台帳との照合（電話・メール）と台帳の【入会】の両方で数える', v_done, v_joined),
      updated_at = now(), deleted_at = null
    where company_id = p_company_id and code = 'conversion_rate' and store_id is null;

    -- ===== 店舗ごと =====
    for v_store in
      select id, name from stores where company_id = p_company_id and status = 'active' and deleted_at is null
    loop
      select
        coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', trials) order by m), '[]'::jsonb),
        coalesce((select trials from app.trial_kpi_monthly(p_company_id, v_store.id) where m = v_month_start), 0),
        coalesce(jsonb_agg(jsonb_build_object('date', m::text,
          'value', case when done_cnt > 0 then round(joined_cnt::numeric / done_cnt * 100, 1) else 0 end) order by m), '[]'::jsonb),
        (select case when done_cnt > 0 then round(joined_cnt::numeric / done_cnt * 100, 1) else null end
           from app.trial_kpi_monthly(p_company_id, v_store.id) where m = v_month_start),
        coalesce((select done_cnt from app.trial_kpi_monthly(p_company_id, v_store.id) where m = v_month_start), 0),
        coalesce((select joined_cnt from app.trial_kpi_monthly(p_company_id, v_store.id) where m = v_month_start), 0)
      into v_trial_trend, v_trial_current, v_conv_trend, v_conv_current, v_done, v_joined
      from app.trial_kpi_monthly(p_company_id, v_store.id);

      v_future := greatest(0, coalesce(v_trial_current, 0)::int - coalesce(v_done, 0));

      insert into kpis (company_id, store_id, code, name, area, unit, period, current_value, trend, notes)
      values (p_company_id, v_store.id, 'trial_bookings', '体験人数（当月）', 'members', '件', 'monthly',
              v_trial_current, v_trial_trend,
              format('%s の体験件数。内訳: 来店済 %s件・これから %s件', v_store.name, v_done, v_future))
      on conflict (company_id, store_id, code) where store_id is not null
      do update set name = excluded.name, current_value = excluded.current_value, trend = excluded.trend,
                    notes = excluded.notes, updated_at = now(), deleted_at = null;

      insert into kpis (company_id, store_id, code, name, area, unit, period, current_value, trend, notes)
      values (p_company_id, v_store.id, 'conversion_rate', '体験→入会率', 'members', '%', 'monthly',
              v_conv_current, v_conv_trend,
              format('%s: 来店済の体験 %s名のうち %s名が入会（会員台帳と電話・メールで照合）', v_store.name, v_done, v_joined))
      on conflict (company_id, store_id, code) where store_id is not null
      do update set name = excluded.name, current_value = excluded.current_value, trend = excluded.trend,
                    notes = excluded.notes, updated_at = now(), deleted_at = null;
    end loop;
    return;
  end if;

  -- 受付台帳がまだ無い会社（旧経路）。ここは従来のまま
  if not exists (select 1 from mbr_trial_bookings where company_id = p_company_id and deleted_at is null) then return; end if;
  with monthly as (
    select date_trunc('month', coalesce(lesson_date, created_at::date))::date as m,
           count(*) filter (where status <> 'canceled') as trials,
           count(*) filter (where status = 'visited') as visited,
           count(*) filter (where joined) as joined
    from mbr_trial_bookings where company_id = p_company_id and deleted_at is null
    group by 1 order by 1 desc limit 12)
  select coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', trials) order by m), '[]'::jsonb),
    coalesce((select trials from monthly where m = v_month_start), 0),
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', case when visited > 0 then round(joined::numeric / visited * 100, 1) else 0 end) order by m), '[]'::jsonb),
    (select case when visited > 0 then round(joined::numeric / visited * 100, 1) else null end from monthly where m = v_month_start)
  into v_trial_trend, v_trial_current, v_conv_trend, v_conv_current from monthly;
  update kpis set current_value = v_trial_current, trend = v_trial_trend, updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'trial_bookings' and store_id is null;
  update kpis set current_value = v_conv_current, trend = v_conv_trend, updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'conversion_rate' and store_id is null;
end
$$;

grant execute on function refresh_member_kpis(uuid) to service_role;

-- 適用後の実測（2026-09-03）
--   FRANK GOLF 姫路 9月: 体験28件（来店済13・これから15）／入会2名 → 15.4%
--   GOLF WING 宝塚 7月: 13件・9名 → 69.2%／8月: 8件・5名 → 62.5%（従来の【入会】ボタン経路と一致）
