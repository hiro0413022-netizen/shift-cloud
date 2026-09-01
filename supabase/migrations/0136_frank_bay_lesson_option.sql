-- 0136: 打席予約のオプション「パーソナルレッスン25分」（2026-09-01 ユーザー確定）
--
-- 運用:
--   会員は frankgolf.jp/booking.html で「毎時00分スタート・1時間 or 2時間」の打席を予約し、
--   そのとき「パーソナルレッスン（25分）を追加」を選べる。**申込は希望まで**で、
--   誰が・打席時間内のどこで教えるかは店舗（member-os）が確定する。
--   → 予約1件に対して0か1件なので、別テーブルを作らず frunk_bookings の列で持つ。
--
-- 列:
--   lesson_option_status  … null=希望なし / requested=希望あり（未確定） / confirmed=確定 / declined=お受けできず / cancelled
--   lesson_option_staff_id… 担当プロ（確定時）
--   lesson_option_start   … レッスンの開始時刻（確定時。打席予約の時間内）
--   lesson_option_minutes … 所要（既定25分）
--   lesson_option_fee     … 料金（円・既定2,500）
--   lesson_option_note    … 会員からのご要望／店舗メモ

alter table frunk_bookings add column if not exists lesson_option_status   text;
alter table frunk_bookings add column if not exists lesson_option_staff_id uuid references staff(id);
alter table frunk_bookings add column if not exists lesson_option_start    time;
alter table frunk_bookings add column if not exists lesson_option_minutes  integer;
alter table frunk_bookings add column if not exists lesson_option_fee      integer;
alter table frunk_bookings add column if not exists lesson_option_note     text;

alter table frunk_bookings drop constraint if exists frunk_bookings_lesson_option_chk;
alter table frunk_bookings
  add constraint frunk_bookings_lesson_option_chk
  check (lesson_option_status is null
         or lesson_option_status in ('requested','confirmed','declined','cancelled'));

-- 「まだ担当が決まっていない希望」を店舗が取りこぼさないための索引（日付順に拾う）
create index if not exists idx_frunk_bookings_lesson_option
  on frunk_bookings (booked_date, start_time)
  where lesson_option_status = 'requested' and deleted_at is null;

comment on column frunk_bookings.lesson_option_status is
  '打席予約に付けた25分パーソナルレッスンの状態。requested=会員の希望（未確定）／confirmed=店舗が担当と時間を確定';
