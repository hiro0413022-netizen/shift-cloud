-- 0042_lesson_os_p1.sql
-- Lesson OS P1: ベストスイング印と生徒目標（WING NOTE実機調査を反映 / DECISIONS #49）
alter table lsn_videos add column if not exists is_best boolean not null default false;
alter table lsn_students add column if not exists goal text;
comment on column lsn_videos.is_best is 'ベストスイング印（生徒ごとに1本、WING NOTEの☆相当）';
comment on column lsn_students.goal is 'レッスン目標（例: いつも90台で回りたい）';
