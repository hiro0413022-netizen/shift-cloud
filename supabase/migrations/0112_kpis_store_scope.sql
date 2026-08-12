-- 0112_kpis_store_scope.sql
-- 5大KPIに店舗次元を追加（DECISIONS #134 / #128の積み残し）
--
-- 背景: kpis テーブルは company_id しか持たず、体験数(trial_bookings)や
--       体験→入会率(conversion_rate)が GOLF WING 宝塚 と FRANK GOLF 姫路 の
--       「合算」になっていた。Genesisホームの数字が構造的に嘘になる。
--
-- 方針: store_id を追加し、NULL = 全社行（従来どおり）、非NULL = 店舗行 とする。
--       画面は「店舗行があればそれを、無ければ全社行を」読む（apps/genesis pickKpisForScope）。
--
-- ⚠ 重要ルール: 今後あるKPIコードで店舗別行を作るようにしたら、その code を書く
--   refresh_*_kpis 関数の update に必ず `and store_id is null` を足すこと。
--   忘れると全社行の値で店舗行が上書きされる（サイレント破壊）。
--   現状の担当: refresh_finance_kpis=monthly_sales/labor_cost_ratio,
--   refresh_shift_cloud_kpis=labor_cost, refresh_smart_hello_kpis=members/churn_rate
--   はいずれも全社行のみ＝店舗行と衝突しない。

-- ============================================================
-- 1. kpis.store_id
-- ============================================================
alter table kpis add column if not exists store_id uuid references stores(id);

comment on column kpis.store_id is
  'NULL=全社（会社合算）行 / 非NULL=店舗別行。店舗またぎ廃止(#128/#134)に伴い追加';

-- 既存の unique(company_id, code) を外し、全社行と店舗行を共存させる。
-- Postgres は NULL 同士を「別物」と見るため素の unique では全社行の重複を防げない。
-- そこで部分ユニークインデックスを2本張る。
alter table kpis drop constraint if exists kpis_company_id_code_key;

create unique index if not exists kpis_company_code_all_uniq
  on kpis (company_id, code) where store_id is null;

create unique index if not exists kpis_company_store_code_uniq
  on kpis (company_id, store_id, code) where store_id is not null;

create index if not exists kpis_store_idx on kpis (store_id) where store_id is not null;

-- ============================================================
-- 2. refresh_member_kpis — 全社行に加えて店舗別行も更新する
--    mbr_walkin_visits は store_id を持つ（0018）ので店舗別に出せる。
-- ============================================================
create or replace function refresh_member_kpis(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
  v_trial_trend jsonb;
  v_trial_current numeric;
  v_conv_trend jsonb;
  v_conv_current numeric;
  v_use_walkin boolean;
  v_store record;
begin
  v_use_walkin := exists (select 1 from mbr_walkin_visits where company_id = p_company_id and deleted_at is null);

  if v_use_walkin then
    -- ---------- 2-1. 全社行（従来どおりの合算。store_id is null） ----------
    with monthly as (
      select date_trunc('month', visited_on)::date as m,
             count(*) filter (where visit_type = 'trial') as trials,
             count(*) filter (where visit_type = 'trial' and result = 'join') as joined
      from mbr_walkin_visits
      where company_id = p_company_id and deleted_at is null
      group by 1 order by 1 desc limit 12
    )
    select
      coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', trials) order by m), '[]'::jsonb),
      coalesce((select trials from monthly where m = v_month_start), 0),
      coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value',
               case when trials > 0 then round(joined::numeric / trials * 100, 1) else 0 end) order by m), '[]'::jsonb),
      (select case when trials > 0 then round(joined::numeric / trials * 100, 1) else null end
         from monthly where m = v_month_start)
    into v_trial_trend, v_trial_current, v_conv_trend, v_conv_current
    from monthly;

    update kpis set current_value = v_trial_current, trend = v_trial_trend,
      notes = '一時利用者名簿（mbr_walkin_visits・体験利用件数）から自動集計／全店合算',
      updated_at = now(), deleted_at = null
    where company_id = p_company_id and code = 'trial_bookings' and store_id is null;

    update kpis set current_value = v_conv_current, trend = v_conv_trend,
      notes = '一時利用者名簿（体験→入会数÷体験件数）から自動集計／全店合算',
      updated_at = now(), deleted_at = null
    where company_id = p_company_id and code = 'conversion_rate' and store_id is null;

    -- ---------- 2-2. 店舗別行（#134。無ければ作る） ----------
    for v_store in
      select id, name from stores
      where company_id = p_company_id and status = 'active' and deleted_at is null
    loop
      with monthly as (
        select date_trunc('month', visited_on)::date as m,
               count(*) filter (where visit_type = 'trial') as trials,
               count(*) filter (where visit_type = 'trial' and result = 'join') as joined
        from mbr_walkin_visits
        where company_id = p_company_id and store_id = v_store.id and deleted_at is null
        group by 1 order by 1 desc limit 12
      )
      select
        coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', trials) order by m), '[]'::jsonb),
        coalesce((select trials from monthly where m = v_month_start), 0),
        coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value',
                 case when trials > 0 then round(joined::numeric / trials * 100, 1) else 0 end) order by m), '[]'::jsonb),
        (select case when trials > 0 then round(joined::numeric / trials * 100, 1) else null end
           from monthly where m = v_month_start)
      into v_trial_trend, v_trial_current, v_conv_trend, v_conv_current
      from monthly;

      insert into kpis (company_id, store_id, code, name, area, unit, period, current_value, trend, notes)
      values (p_company_id, v_store.id, 'trial_bookings', '体験利用者数', 'members', '件', 'monthly',
              v_trial_current, v_trial_trend, v_store.name || ' の体験利用件数（mbr_walkin_visits）')
      on conflict (company_id, store_id, code) where store_id is not null
      do update set current_value = excluded.current_value, trend = excluded.trend,
                    notes = excluded.notes, updated_at = now(), deleted_at = null;

      insert into kpis (company_id, store_id, code, name, area, unit, period, current_value, trend, notes)
      values (p_company_id, v_store.id, 'conversion_rate', '体験→入会率', 'members', '%', 'monthly',
              v_conv_current, v_conv_trend, v_store.name || ' の体験→入会率（入会数÷体験件数）')
      on conflict (company_id, store_id, code) where store_id is not null
      do update set current_value = excluded.current_value, trend = excluded.trend,
                    notes = excluded.notes, updated_at = now(), deleted_at = null;
    end loop;

    return;
  end if;

  -- ---------- フォールバック（旧: 体験予約 mbr_trial_bookings・店舗次元なし） ----------
  if not exists (select 1 from mbr_trial_bookings where company_id = p_company_id and deleted_at is null) then
    return;
  end if;
  with monthly as (
    select date_trunc('month', coalesce(lesson_date, created_at::date))::date as m,
           count(*) filter (where status <> 'canceled') as trials,
           count(*) filter (where status = 'visited') as visited,
           count(*) filter (where joined) as joined
    from mbr_trial_bookings
    where company_id = p_company_id and deleted_at is null
    group by 1 order by 1 desc limit 12
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', trials) order by m), '[]'::jsonb),
    coalesce((select trials from monthly where m = v_month_start), 0),
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value',
             case when visited > 0 then round(joined::numeric / visited * 100, 1) else 0 end) order by m), '[]'::jsonb),
    (select case when visited > 0 then round(joined::numeric / visited * 100, 1) else null end
       from monthly where m = v_month_start)
  into v_trial_trend, v_trial_current, v_conv_trend, v_conv_current
  from monthly;

  update kpis set current_value = v_trial_current, trend = v_trial_trend, updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'trial_bookings' and store_id is null;
  update kpis set current_value = v_conv_current, trend = v_conv_trend, updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'conversion_rate' and store_id is null;
end $$;

-- 権限は 0014 の方針どおり authenticated には付けない（service_role のみ）。
-- 新関数・置換関数は service_role へのEXECUTE付与を忘れるとサイレント破壊になる（DB権限監査 2026-07-17）。
grant execute on function refresh_member_kpis(uuid) to service_role;

-- ============================================================
-- 3. lsn_students.store_id のバックフィル
--    列は 0041 で存在するが、GOLF WING の既存生徒は NULL のまま。
--    NULL は「どの店か不明」で店舗スコープから漏れるため宝塚に寄せる。
--    （FRANK 由来のカルテは frank-join.ts が店舗IDを入れているので対象外）
-- ============================================================
update lsn_students s
   set store_id = (select st.id from stores st
                    where st.company_id = s.company_id and st.code = 'takarazuka'
                      and st.deleted_at is null limit 1),
       updated_at = now()
 where s.store_id is null
   and exists (select 1 from stores st
                where st.company_id = s.company_id and st.code = 'takarazuka'
                  and st.deleted_at is null);
