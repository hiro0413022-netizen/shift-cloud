-- 0081: FRANK GOLF 打席予約 v1（#86 / FRANK §3-3）適用済（MCP 2026-07-26）
-- frunk_bays: 5打席（1F TrackMan4×2 / 2F OKONGOLF・DTECT×2）
-- frunk_bookings: 30分単位・二重予約はDBのunique indexで防止
-- 会員認証は 会員番号＋電話下4桁（API側）。プラン上限（1日の時間・ライトは月8日）もAPI側でenforcement
create table if not exists frunk_bays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  code text not null unique,
  name text not null,
  floor int not null,
  equipment text,
  sort int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  deleted_at timestamptz
);
alter table frunk_bays enable row level security;

create table if not exists frunk_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid not null,
  member_id uuid not null references frunk_members(id),
  bay_id uuid not null references frunk_bays(id),
  booked_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  source text not null default 'web',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
alter table frunk_bookings enable row level security;
create index if not exists idx_frunk_bookings_date on frunk_bookings (booked_date, bay_id) where deleted_at is null;
create unique index if not exists uq_frunk_booking_slot on frunk_bookings (bay_id, booked_date, start_time)
  where status = 'confirmed' and deleted_at is null;

insert into frunk_bays (company_id, code, name, floor, equipment, sort) values
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7', 'bay-1f-l', '1F 左打席', 1, 'TrackMan 4', 1),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7', 'bay-1f-r', '1F 右打席', 1, 'TrackMan 4', 2),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7', 'bay-2f-1', '2F ルーム1', 2, 'OKONGOLF', 3),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7', 'bay-2f-2', '2F ルーム2', 2, 'DTECT', 4),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7', 'bay-2f-3', '2F ルーム3', 2, 'DTECT', 5)
on conflict (code) do nothing;
