-- 0056_reserve_hours.sql
-- 予約OS: 受付可能な曜日・時間帯をDBで持つ（DECISIONS #58）。
--
-- 背景: 希望日時が自由入力(datetime-local)だったため、火曜（定休日）や営業時間外の希望が入りうる。
--   スタッフが調整し直す手戻りになるので、**選べる選択肢そのものを絞る**（入力を減らすのが最善の検証）。
--   ルールはコードに埋めずDBに置く（営業時間の変更をデプロイなしで反映できる）。

alter table res_services add column if not exists closed_weekdays smallint[] not null default '{2}';  -- 0=日 1=月 2=火 …（火曜定休）
alter table res_services add column if not exists open_time time not null default '11:00';
alter table res_services add column if not exists close_time time not null default '18:00';
alter table res_services add column if not exists slot_step_min integer not null default 30;          -- 開始時刻の刻み
alter table res_services add column if not exists booking_window_days integer not null default 60;    -- 何日先まで選べるか
alter table res_services add column if not exists min_lead_days integer not null default 1;           -- 最短で何日後から（1=翌日以降）

update res_services
set closed_weekdays = '{2}',
    open_time = '11:00',
    close_time = '18:00',
    slot_step_min = 30,
    booking_window_days = 60,
    min_lead_days = 1
where slug = 'shaft-fitting';
