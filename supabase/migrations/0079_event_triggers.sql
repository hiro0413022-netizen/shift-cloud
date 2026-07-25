-- 0079: イベント一元化（DECISIONS #83 / REDESIGN §5b）
-- 体験申込・Web入会申込・予約申込・アンケート回答の到着を DBトリガーで company_events に集約。
-- アプリ側のコード変更ゼロで漏れなく、CEO AIの観測・ホームのティッカー・ダイジェストの源泉になる。

create or replace function gn_log_app_event() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_type text; v_title text;
begin
  if tg_table_name = 'mbr_trial_requests' then
    v_type := 'trial.requested'; v_title := '体験申込が届きました: ' || coalesce(new.name, 'お客様');
  elsif tg_table_name = 'frunk_members' then
    if new.status is distinct from 'pending' then return new; end if;
    v_type := 'join.requested'; v_title := 'Web入会申込が届きました: ' || coalesce(new.name, 'お客様');
  elsif tg_table_name = 'res_requests' then
    v_type := 'reserve.requested'; v_title := '予約申込が届きました: ' || coalesce(new.name, 'お客様') || '（' || coalesce(new.service_name, '予約') || '）';
  elsif tg_table_name = 'svy_responses' then
    v_type := 'survey.responded'; v_title := 'アンケート回答が届きました';
  else
    return new;
  end if;
  insert into company_events (company_id, event_type, title, source, source_type, occurred_at)
  values (new.company_id, v_type, left(v_title, 120), 'db_trigger', 'system', now());
  return new;
exception when others then
  return new; -- イベント記録の失敗で業務insertを止めない
end;
$$;

drop trigger if exists trg_gn_event_trial on mbr_trial_requests;
create trigger trg_gn_event_trial after insert on mbr_trial_requests for each row execute function gn_log_app_event();
drop trigger if exists trg_gn_event_join on frunk_members;
create trigger trg_gn_event_join after insert on frunk_members for each row execute function gn_log_app_event();
drop trigger if exists trg_gn_event_reserve on res_requests;
create trigger trg_gn_event_reserve after insert on res_requests for each row execute function gn_log_app_event();
drop trigger if exists trg_gn_event_survey on svy_responses;
create trigger trg_gn_event_survey after insert on svy_responses for each row execute function gn_log_app_event();
