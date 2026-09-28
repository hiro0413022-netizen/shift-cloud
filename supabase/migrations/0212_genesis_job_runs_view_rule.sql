-- 0212: 定期処理の台帳を Ask Data / Proactive ルールから見えるように（#296・P3-b Self Healing）
--   gn_job_runs は genesis の cron（execute / daily）と demo-sales の cron（prospect / outreach）が同じ表に記録する。
--   gnv_job_runs（hq のみ）を足し、ルール jobs_stale で「止まっている定期処理」を Inbox（判断フィード）に出す。
--   追加のみ。

create or replace view gnv_job_runs as
  select r.job, r.started_at, r.finished_at, r.ok, r.error, r.summary,
         extract(epoch from (now() - r.started_at)) / 60 as age_min
  from gn_job_runs r
  where gn_ctx_is_hq() and (r.company_id is null or r.company_id = gn_ctx_company());
comment on view gnv_job_runs is 'Ask Data: 定期処理（cron）の実行記録。job / started_at / ok / error / age_min（分）。本部のみ';
revoke all on gnv_job_runs from public;
grant select on gnv_job_runs to gn_chat_reader;
grant select on gnv_job_runs to service_role;

-- 止まっている定期処理（直近の実行が上限分数より古い、または失敗）。上限は JOB_EXPECTATIONS（genesis-core/scheduler.ts）と揃える
-- 一度も記録が無い job は「止まった」とは言えないので対象外（health.check が「記録なし」として出す）
insert into gn_rules (company_id, code, name, description, condition_sql, severity, title_template, body_template, suggested_action, href, schedule, cooldown_hours)
select c.id, 'jobs_stale', '止まっている定期処理', 'cron:daily / cron:prospect は26時間、cron:outreach は2時間、直近の実行が無いか失敗している',
  $$select lim.job,
           round(coalesce(extract(epoch from (now() - lst.started_at)) / 60, 99999)) as age_min,
           lim.max_min,
           (select r.ok from gnv_job_runs r where r.job = lim.job order by r.started_at desc limit 1) as last_ok
    from (values ('cron:daily', 1560), ('cron:prospect', 1560), ('cron:outreach', 120)) as lim(job, max_min)
    left join (select job, max(started_at) as started_at from gnv_job_runs group by job) as lst on lst.job = lim.job
    where lst.started_at < now() - make_interval(mins => lim.max_min)
       or (select r.ok from gnv_job_runs r where r.job = lim.job order by r.started_at desc limit 1) = false$$,
  'critical', '定期処理が {count} 本止まっています', '直近の実行が上限より古い、または失敗した cron。Vercel の Cron 設定・CRON_SECRET・maxDuration を確認してください（Evidence: gn_job_runs）。',
  '止まっている定期処理を確認する', '/?ask=止まっている定期処理を一覧で', 'every_tick', 6
from companies c
where c.deleted_at is null
  and exists (select 1 from stores s where s.company_id = c.id and s.deleted_at is null)
on conflict (company_id, code) do nothing;
