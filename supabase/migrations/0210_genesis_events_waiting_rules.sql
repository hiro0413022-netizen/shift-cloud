-- ============================================================
-- 0210: Genesis P2-a — イベント発火（トリガー）・Waiting For・Proactive ルール・ジョブ実行記録（#292）
--
-- 方針（Final Architecture §6・Proposal 7章/10章）:
--   1. DB で起きたことは DB がイベントにする（トリガー）。アプリの emit() と二重にならないよう、
--      同じ entity・type が直近 60 秒にあればスキップする（gn_emit）。
--   2. gn_waiting … 「〇〇待ち」の台帳。期限を過ぎたら cron が「そろそろフォローしますか？」を ai_suggestions に起票。
--   3. gn_rules   … Proactive の宣言（condition_sql は gnv_* ビューへの SELECT・gn_chat_query で実行＝実体テーブルに触れない）。
--      発火は ai_suggestions（既存の判断フィードにそのまま出る）＋ gn_events 'rule.fired'。
--   4. gn_job_runs … cron / refresh の実行記録。Self Healing が「24時間走っていない」を見る。
-- 追加のみ。既存テーブルの列・制約は変えない（トリガーの追加のみ）。
-- ============================================================

-- 0. 発火関数（重複抑止つき） ------------------------------------------------------
create or replace function gn_emit(
  p_company_id uuid, p_store_id uuid, p_type text, p_version int,
  p_entity_kind text, p_entity_id text, p_payload jsonb, p_source text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_company_id is null then return null; end if;
  -- 同じ entity・type が直近60秒にあれば二重発火とみなす（アプリの emit() とトリガーの両方が走るケース）
  if p_entity_id is not null and exists (
    select 1 from gn_events
    where company_id = p_company_id and type = p_type and entity_kind = p_entity_kind and entity_id = p_entity_id
      and occurred_at > now() - interval '60 seconds'
  ) then return null; end if;
  insert into gn_events (company_id, store_id, type, schema_version, entity_kind, entity_id, payload, actor_kind, source)
  values (p_company_id, p_store_id, p_type, coalesce(p_version, 1), p_entity_kind, p_entity_id, coalesce(p_payload, '{}'::jsonb), 'system', p_source)
  returning id into v_id;
  return v_id;
exception when others then
  -- イベント発火の失敗で業務の INSERT/UPDATE を止めない
  return null;
end $$;
revoke all on function gn_emit(uuid, uuid, text, int, text, text, jsonb, text) from public;
grant execute on function gn_emit(uuid, uuid, text, int, text, text, jsonb, text) to service_role;

-- 1. トリガー -------------------------------------------------------------------------
-- 打席予約（FRANK）
create or replace function gn_trg_frunk_bookings() returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  who := coalesce(new.guest_name, (select name from frunk_members where id = new.member_id), '');
  if tg_op = 'INSERT' and new.deleted_at is null and new.status <> 'cancelled' then
    perform gn_emit(new.company_id, new.store_id, 'reservation.created', 1, 'reservation', new.id::text,
      jsonb_build_object('booking_id', new.id, 'date', new.booked_date, 'start', to_char(new.start_time, 'HH24:MI'), 'who', who, 'source', new.source,
        'summary', '予約: ' || new.booked_date || ' ' || to_char(new.start_time, 'HH24:MI') || ' ' || who), 'trigger:frunk_bookings');
  elsif tg_op = 'UPDATE' then
    if old.status <> 'cancelled' and new.status = 'cancelled' then
      perform gn_emit(new.company_id, new.store_id, 'reservation.cancelled', 1, 'reservation', new.id::text,
        jsonb_build_object('booking_id', new.id, 'summary', '予約取消: ' || new.booked_date || ' ' || to_char(new.start_time, 'HH24:MI') || ' ' || who), 'trigger:frunk_bookings');
    end if;
    if coalesce(old.payment_status, '') <> 'paid' and new.payment_status = 'paid' and coalesce(new.amount, 0) > 0 then
      perform gn_emit(new.company_id, new.store_id, 'payment.completed', 1, 'reservation', new.id::text,
        jsonb_build_object('booking_id', new.id, 'amount', new.amount, 'method', new.payment_method, 'summary', '入金: ' || who || ' ' || new.amount || '円'), 'trigger:frunk_bookings');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_gn_frunk_bookings on frunk_bookings;
create trigger trg_gn_frunk_bookings after insert or update on frunk_bookings for each row execute function gn_trg_frunk_bookings();

-- 受付台帳（来店・体験）
create or replace function gn_trg_walkin() returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'INSERT' and new.deleted_at is null then
    who := coalesce((select name from mbr_guests where id = new.guest_id), '');
    perform gn_emit(new.company_id, new.store_id, 'visit.recorded', 1, 'person', new.guest_id::text,
      jsonb_build_object('walkin_id', new.id, 'visited_on', new.visited_on, 'visit_type', new.visit_type, 'guest', who,
        'summary', case when new.visit_type = 'trial' then '体験' else '来店' end || ': ' || new.visited_on || ' ' || who), 'trigger:mbr_walkin_visits');
  elsif tg_op = 'UPDATE' and coalesce(old.result, '') <> 'join' and new.result = 'join' then
    who := coalesce((select name from mbr_guests where id = new.guest_id), '');
    perform gn_emit(new.company_id, new.store_id, 'trial.converted', 1, 'person', new.guest_id::text,
      jsonb_build_object('walkin_id', new.id, 'guest', who, 'summary', '体験→入会: ' || who), 'trigger:mbr_walkin_visits');
  end if;
  return new;
end $$;
drop trigger if exists trg_gn_walkin on mbr_walkin_visits;
create trigger trg_gn_walkin after insert or update on mbr_walkin_visits for each row execute function gn_trg_walkin();

-- FRANK 会員（在籍・休会・退会）
create or replace function gn_trg_frunk_members() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and coalesce(old.status, '') <> coalesce(new.status, '') then
    if new.status = 'active' and coalesce(old.status, '') in ('', 'pending', 'suspended') then
      perform gn_emit(new.company_id, new.store_id, case when coalesce(old.status, '') = 'suspended' then 'membership.resumed' else 'membership.started' end, 1, 'person', new.id::text,
        jsonb_build_object('member_no', new.member_no, 'name', new.name, 'summary', '入会/復帰: ' || coalesce(new.member_no, '') || ' ' || new.name), 'trigger:frunk_members');
    elsif new.status = 'suspended' then
      perform gn_emit(new.company_id, new.store_id, 'membership.suspended', 1, 'person', new.id::text,
        jsonb_build_object('member_no', new.member_no, 'name', new.name, 'summary', '休会: ' || coalesce(new.member_no, '') || ' ' || new.name), 'trigger:frunk_members');
    elsif new.status = 'left' then
      perform gn_emit(new.company_id, new.store_id, 'membership.left', 1, 'person', new.id::text,
        jsonb_build_object('member_no', new.member_no, 'name', new.name, 'summary', '退会: ' || coalesce(new.member_no, '') || ' ' || new.name), 'trigger:frunk_members');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_gn_frunk_members on frunk_members;
create trigger trg_gn_frunk_members after update on frunk_members for each row execute function gn_trg_frunk_members();

-- 問い合わせ（LINE・メール・フォーム）
create or replace function gn_trg_inquiries() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform gn_emit(new.company_id, null, 'inquiry.received', 1, 'inquiry', new.id::text,
      jsonb_build_object('source', new.source, 'type', new.inquiry_type, 'priority', new.priority, 'from', new.from_name, 'summary', '問い合わせ(' || coalesce(new.source, '') || '): ' || coalesce(new.from_name, '') || ' ' || coalesce(new.subject, '')), 'trigger:sec_inquiries');
  elsif tg_op = 'UPDATE' and old.reply_sent_at is null and new.reply_sent_at is not null then
    perform gn_emit(new.company_id, null, 'inquiry.replied', 1, 'inquiry', new.id::text,
      jsonb_build_object('from', new.from_name, 'summary', '返信済み: ' || coalesce(new.from_name, '')), 'trigger:sec_inquiries');
  end if;
  return new;
end $$;
drop trigger if exists trg_gn_inquiries on sec_inquiries;
create trigger trg_gn_inquiries after insert or update on sec_inquiries for each row execute function gn_trg_inquiries();

-- シフト確定（店舗×日で1件に丸める＝60秒の重複抑止が効く）
create or replace function gn_trg_shifts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status::text <> 'published' and new.status::text = 'published' then
    perform gn_emit(new.company_id, new.store_id, 'shift.published', 1, 'shift_day', coalesce(new.store_id::text, '') || ':' || new.date::text,
      jsonb_build_object('date', new.date, 'store_id', new.store_id, 'summary', 'シフト確定: ' || new.date), 'trigger:shifts');
  end if;
  return new;
end $$;
drop trigger if exists trg_gn_shifts on shifts;
create trigger trg_gn_shifts after update on shifts for each row execute function gn_trg_shifts();

-- イレギュラー報告
create or replace function gn_trg_incidents() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform gn_emit(new.company_id, new.store_id, 'incident.reported', 1, 'incident', new.id::text,
      jsonb_build_object('category', new.category, 'severity', new.severity, 'summary', 'イレギュラー(' || coalesce(new.severity, '') || '): ' || coalesce(new.category, '') || ' ' || left(coalesce(new.body, ''), 60)), 'trigger:sp_incidents');
  end if;
  return new;
end $$;
drop trigger if exists trg_gn_incidents on sp_incidents;
create trigger trg_gn_incidents after insert on sp_incidents for each row execute function gn_trg_incidents();

-- モバイルオーダー
create or replace function gn_trg_orders() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform gn_emit(new.company_id, new.store_id, 'order.placed', 1, 'order', new.id::text,
      jsonb_build_object('order_no', new.order_no, 'amount', new.amount, 'summary', '注文: ' || coalesce(new.order_no, '') || ' ' || coalesce(new.amount, 0) || '円'), 'trigger:frunk_orders');
  end if;
  return new;
end $$;
drop trigger if exists trg_gn_orders on frunk_orders;
create trigger trg_gn_orders after insert on frunk_orders for each row execute function gn_trg_orders();

-- 2. Waiting For ------------------------------------------------------------------------
create table if not exists gn_waiting (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid,
  entity_kind text,                    -- person / inquiry / order / project / partner …
  entity_id text,
  entity_label text,                   -- 「瀬戸口さん」「FR0048 尾内様」
  what text not null,                  -- 「見積の返事」「入金」「商品到着」
  since timestamptz not null default now(),
  expected_by timestamptz,             -- これを過ぎたら「そろそろフォローしますか？」
  followup_tool text,                  -- 'message.draft@1' など（P3 で Skill に）
  followup_note text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  closed_at timestamptz,
  closed_by uuid references staff(id),
  closed_reason text,                  -- 'event:inquiry.replied' / 'manual'
  created_by uuid references staff(id),
  source text,                         -- 'jarvis' / 'tool' / 'event:...'
  nudged_at timestamptz,               -- 最後に「フォローしますか？」を出した時刻（連打防止）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table gn_waiting is 'Genesis: 〇〇待ちの台帳。期限を過ぎたら cron が ai_suggestions に「そろそろフォロー」を起票';
create index if not exists idx_gn_waiting_open on gn_waiting (company_id, expected_by) where status = 'open';
alter table gn_waiting enable row level security;
drop policy if exists tenant_select on gn_waiting;
create policy tenant_select on gn_waiting for select to authenticated using (company_id = app.current_company_id());

-- 3. Proactive ルール -------------------------------------------------------------------
create table if not exists gn_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,                  -- 'members_stale_90d'
  name text not null,
  description text,
  condition_sql text not null,         -- gnv_* への SELECT（gn_chat_query で hq スコープ実行）。行が返れば発火
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  title_template text not null,        -- '{count}名が90日以上来店していません'
  body_template text,                  -- 根拠（Recommendation Evidence: Evidence / Expected Impact / Risk）
  suggested_action text,               -- 「フォロー文を作る」
  action_tool text,                    -- 提案から押せる Tool（P3）
  href text,
  schedule text not null default 'daily' check (schedule in ('every_tick', 'daily', 'weekly')),
  cooldown_hours int not null default 24,  -- 同じルールを再起票しない時間
  enabled boolean not null default true,
  last_fired_at timestamptz,
  last_count int,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);
comment on table gn_rules is 'Genesis: Proactive の宣言。Detect(SQL)→Explain(根拠)→Recommend(提案)→Act(Tool)。発火先は ai_suggestions';
alter table gn_rules enable row level security;
drop policy if exists tenant_select on gn_rules;
create policy tenant_select on gn_rules for select to authenticated using (company_id = app.current_company_id());

-- 4. ジョブ実行記録 -------------------------------------------------------------------------
create table if not exists gn_job_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  job text not null,                   -- 'cron:execute' / 'cron:daily' / 'events:process' / 'rules:evaluate' / 'waiting:nudge'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb,
  error text
);
create index if not exists idx_gn_job_runs_job on gn_job_runs (job, started_at desc);
comment on table gn_job_runs is 'Genesis: cron / refresh の実行記録。Self Healing が「走っていない」を検知する';

-- 5. 初期ルール（YOZAN）。条件は gnv_* のみ・行が返れば発火 ------------------------------------------
insert into gn_rules (company_id, code, name, description, condition_sql, severity, title_template, body_template, suggested_action, href, schedule, cooldown_hours)
select c.id, v.code, v.name, v.description, v.sql, v.severity, v.title, v.body, v.action, v.href, v.schedule, v.cooldown
from companies c
cross join (values
  ('members_stale_90d', '90日以上来店なしの会員', '在籍中で最終来店が90日以上前の GOLF WING 会員',
   $$select member_no, member_name, last_visit_date from gnv_members where is_active and last_visit_date is not null and last_visit_date < current_date - 90 order by last_visit_date limit 50$$,
   'warning', '{count}名の会員が90日以上来店していません', '在籍中なのに90日以上来店が無い会員。退会の前兆になりやすい層です（Evidence: gnv_members.last_visit_date）。フォローの一言で戻る方が一定数います。', '来店していない会員にフォロー文を作る', '/?ask=90日以上来店していない会員を一覧で', 'weekly', 168),
  ('trials_unfollowed_14d', '体験後14日フォローなし', '体験に来て入会も断りも記録が無く、フォローも入っていない方',
   $$select visited_on, guest_name, store_name from gnv_walkins where visit_type = 'trial' and result is null and follow_up_at is null and visited_on >= current_date - 14 and visited_on < current_date - 2 order by visited_on limit 50$$,
   'warning', '体験後フォローが無い方が{count}名います', '体験から3日以上経って結果もフォローも入っていない方。入会率に直接効く層です（Evidence: gnv_walkins result/follow_up_at）。', '体験者へのフォローLINEを作る', '/?ask=体験後にフォローがない方を一覧で', 'daily', 24),
  ('inquiries_unreplied_24h', '24時間返信なしの問い合わせ', '受信から24時間以上、返信も対応済みにもなっていない問い合わせ',
   $$select received_at, source, from_name, subject from gnv_inquiries where reply_sent_at is null and status in ('new', 'pending', 'draft') and received_at < now() - interval '24 hours' order by received_at limit 50$$,
   'critical', '{count}件の問い合わせが24時間以上返信されていません', '問い合わせの返信が1日を超えると体験申込の取りこぼしになります（Evidence: gnv_inquiries）。', '返信の下書きを承認する', '/?ask=未返信の問い合わせを一覧で', 'every_tick', 6),
  ('bookings_tomorrow_no_shift', '明日、予約があるのにシフトが無い', 'FRANK: 明日の有効な予約があるのに、明日の確定シフト（休み以外）が1件も無い',
   $$select count(*) as bookings from gnv_bookings where booked_date = current_date + 1 and status <> 'cancelled' having count(*) > 0 and not exists (select 1 from gnv_shifts where date = current_date + 1 and not is_day_off and status = 'published' and store_name like '%FRANK%')$$,
   'critical', '明日は予約があるのに FRANK のシフトが確定していません', '明日の予約 {count} 件に対して、確定シフト（出勤）が0件です（Evidence: gnv_bookings × gnv_shifts）。', '明日のシフトを確認する', '/?ask=明日の体制', 'daily', 12),
  ('bookings_unpaid_past', '過去の予約で未収', '終わった予約で金額があるのに未入金',
   $$select booked_date, customer_name, amount, payment_status from gnv_bookings where booked_date < current_date and status <> 'cancelled' and coalesce(amount, 0) > 0 and coalesce(payment_status, '') not in ('paid', 'free', 'included') order by booked_date desc limit 50$$,
   'warning', '未収の予約が{count}件あります', '終了済みで金額が付いているのに入金になっていない予約（Evidence: gnv_bookings.payment_status）。', '未収一覧を確認する', '/?ask=未収の予約を一覧で', 'daily', 48)
) as v(code, name, description, sql, severity, title, body, action, href, schedule, cooldown)
where c.name like '%YOZAN%'
on conflict (company_id, code) do nothing;
