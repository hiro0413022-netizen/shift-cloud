-- 0024_reservation_payments.sql
-- 予約の入金ステータス・未収金管理（member-os / 姫路 FRUNK GOLF）。予約システム Phase 2b。
-- res_bookings.amount（請求額）に対し、入金額・入金方法・入金状態を持たせ、未収金を集計可能に。

alter table res_bookings
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid', 'waived')),
  add column if not exists paid_amount integer not null default 0,
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz;

-- 未収金の絞り込み用（請求額あり・完済/免除でない予約）
create index if not exists idx_res_bookings_outstanding
  on res_bookings (company_id, store_id)
  where deleted_at is null and payment_status in ('unpaid', 'partial');
