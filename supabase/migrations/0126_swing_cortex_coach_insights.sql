-- 0126_swing_cortex_coach_insights.sql
-- SWING CORTEX コーチ別インサイト（2026-08-27）**適用済み**
-- sc_comments をコーチ単位で集計するRPC。6千件超をアプリに引かず、DBで集計して返す。
-- 新関数は service_role に EXECUTE 付与必須（DB権限監査の教訓）。

create or replace function sc_coach_insights(p_company uuid)
returns table(coach text, comment_count bigint, top_phases jsonb, top_symptoms jsonb)
language sql stable
set search_path = public
as $$
  with base as (
    select coalesce(nullif(trim(coach_name), ''), '（コーチ名なし）') as coach,
           phases, symptom_key
    from sc_comments
    where company_id = p_company
  ),
  ph as (
    select b.coach, p as label, count(*) as n
    from base b, unnest(b.phases) as p
    where p <> 'その他'
    group by b.coach, p
  ),
  sy as (
    select b.coach, b.symptom_key as label, count(*) as n
    from base b
    where b.symptom_key is not null and b.symptom_key <> 'その他'
    group by b.coach, b.symptom_key
  )
  select
    b.coach,
    count(*) as comment_count,
    coalesce((
      select jsonb_agg(jsonb_build_object('label', t.label, 'count', t.n) order by t.n desc)
      from (select label, n from ph where ph.coach = b.coach order by n desc limit 6) t
    ), '[]'::jsonb) as top_phases,
    coalesce((
      select jsonb_agg(jsonb_build_object('label', t.label, 'count', t.n) order by t.n desc)
      from (select label, n from sy where sy.coach = b.coach order by n desc limit 5) t
    ), '[]'::jsonb) as top_symptoms
  from base b
  group by b.coach
  order by count(*) desc;
$$;

grant execute on function sc_coach_insights(uuid) to service_role;
