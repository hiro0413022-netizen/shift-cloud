-- 0084: FRANK GOLF 予約台帳の一本化（#93）
--
-- 背景: 予約システムが2つあった。
--   res_resources / res_bookings … member-os の予約管理（0020/0024）。入金・未収金・店頭カレンダーを持つ
--   frunk_bays   / frunk_bookings … 公開API＋サイト（0081/0082/0083）。打席マスタ・プラン上限・レッスン連動・体験を持つ
-- どちらも予約データは0件だったため、frunk_* に寄せて res_* を廃止する。
--
-- 決定した役割分担:
--   お客様の予約 … frankgolf.jp のサイト（booking.html / lesson-booking.html / trial-booking.html）
--   スタッフの管理 … member-os（/reservations・/board）
--
-- ★ res_resources / res_bookings はDROPせず「廃止（未使用）」として残す。
--    誤って使い続けないようコメントで明示する。データは0件。
--    ※ res_services / res_requests（0032）は Reserve OS の別システム。ここでは触らない。

-- ============================================================
-- 1) 会計（res_bookings 0024 相当を frunk_bookings へ）
-- ============================================================
alter table frunk_bookings add column if not exists amount         integer;
alter table frunk_bookings add column if not exists paid_amount    integer not null default 0;
alter table frunk_bookings add column if not exists payment_status text not null default 'unpaid';
alter table frunk_bookings add column if not exists payment_method text;
alter table frunk_bookings add column if not exists paid_at        timestamptz;

comment on column frunk_bookings.amount         is '請求額（円・税込）。null＝請求なし（会員の通常利用・無料体験など）';
comment on column frunk_bookings.payment_status is 'unpaid / partial / paid / waived';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'frunk_bookings_payment_status_chk') then
    alter table frunk_bookings
      add constraint frunk_bookings_payment_status_chk
      check (payment_status in ('unpaid', 'partial', 'paid', 'waived'));
  end if;
end $$;

-- ============================================================
-- 2) 来店実績（status を拡張）
--    reserved相当＝confirmed。来店/無断欠を記録できるようにする
-- ============================================================
alter table frunk_bookings drop constraint if exists frunk_bookings_status_check;
alter table frunk_bookings
  add constraint frunk_bookings_status_check
  check (status in ('confirmed', 'visited', 'no_show', 'cancelled'));

comment on column frunk_bookings.status is 'confirmed=予約 / visited=来店 / no_show=無断欠 / cancelled=キャンセル。枠を占有するのは cancelled 以外';

-- 枠の占有判定を「confirmed のみ」から「cancelled 以外」に広げる
-- （来店済みに変えた瞬間に枠が空いて二重予約が入る、という事故を防ぐ）
drop index if exists uq_frunk_booking_slot;
create unique index if not exists uq_frunk_booking_slot
  on frunk_bookings (bay_id, booked_date, start_time)
  where status <> 'cancelled' and deleted_at is null;

drop index if exists idx_frunk_bookings_date;
create index if not exists idx_frunk_bookings_date
  on frunk_bookings (booked_date, bay_id)
  where deleted_at is null;

-- ============================================================
-- 3) 電話・店頭予約（非会員の都度利用）を受けられるようにする
--    会員=member_id / 体験=trial_request_id / 都度=guest_name
-- ============================================================
alter table frunk_bookings add column if not exists guest_name    text;
alter table frunk_bookings add column if not exists guest_phone   text;
alter table frunk_bookings add column if not exists party_size    integer;
alter table frunk_bookings add column if not exists customer_kind text not null default 'member';

comment on column frunk_bookings.customer_kind is 'member=会員 / trial=体験 / dropin=都度利用（ビジター）';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'frunk_bookings_customer_kind_chk') then
    alter table frunk_bookings
      add constraint frunk_bookings_customer_kind_chk
      check (customer_kind in ('member', 'trial', 'dropin'));
  end if;
end $$;

-- 「持ち主のない予約」を許さない条件を、都度利用ぶんまで広げる
alter table frunk_bookings drop constraint if exists frunk_bookings_owner_chk;
alter table frunk_bookings
  add constraint frunk_bookings_owner_chk
  check (member_id is not null or trial_request_id is not null or guest_name is not null);

-- 既存行の customer_kind を実態に合わせる（現在0件だが、再実行しても安全なように）
update frunk_bookings set customer_kind = 'trial'
 where trial_request_id is not null and customer_kind <> 'trial';
update frunk_bookings set customer_kind = 'dropin'
 where member_id is null and trial_request_id is null and customer_kind <> 'dropin';

create index if not exists idx_frunk_bookings_unpaid
  on frunk_bookings (payment_status, booked_date)
  where deleted_at is null and status <> 'cancelled' and amount is not null;

-- ============================================================
-- 4) 旧テーブルを「廃止」として明示（DROPはしない）
-- ============================================================
comment on table res_bookings  is '【廃止 2026-07-27 / #93】FRANK予約は frunk_bookings に一本化。新規に使わないこと（データ0件のまま移行）';
comment on table res_resources is '【廃止 2026-07-27 / #93】打席マスタは frunk_bays に一本化。新規に使わないこと';
