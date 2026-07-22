-- スマートハロ予約一覧から取り込んだ体験/フィッティングを受付一覧(mbr_walkin_visits)に反映するための出所キー。
-- 予約番号で冪等化（再取込で重複行を作らない／スタッフ追記は保持）。
alter table public.mbr_walkin_visits
  add column if not exists source_reservation_no text;

create unique index if not exists uq_mbr_walkin_visits_reservation_no
  on public.mbr_walkin_visits (company_id, source_reservation_no)
  where source_reservation_no is not null and deleted_at is null;

comment on column public.mbr_walkin_visits.source_reservation_no is
  'スマートハロ予約一覧の予約番号（体験/FT取込の冪等キー）。手入力/タブレット由来はnull。';
