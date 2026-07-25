-- 0082: FRANK GOLF レッスン管理 v1（#88 / FRANK §3-4）
-- frunk_lesson_slots   … プロが公開するレッスン枠（プロ別・打席別）
-- frunk_lesson_bookings… 会員のレッスン予約＋レッスン記録＋申し送り（次回予約に自動表示）
-- カルテ連携: 予約時に lsn_students を member_code で find-or-create（Lesson OSと同一台帳）
-- RLS enableのみ=service_role専用（0081と同型）。関数なし=EXECUTE付与不要。

create table if not exists frunk_lesson_slots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid not null,
  coach_staff_id uuid not null references staff(id),
  bay_id uuid references frunk_bays(id),        -- 使用打席（指定時は打席予約側でもブロック）
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'open' check (status in ('open','closed')),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
alter table frunk_lesson_slots enable row level security;
create index if not exists idx_frunk_lesson_slots_date on frunk_lesson_slots (slot_date, coach_staff_id) where deleted_at is null;
create unique index if not exists uq_frunk_lesson_slot on frunk_lesson_slots (coach_staff_id, slot_date, start_time)
  where deleted_at is null;

create table if not exists frunk_lesson_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid not null,
  slot_id uuid not null references frunk_lesson_slots(id),
  member_id uuid not null references frunk_members(id),
  student_id uuid references lsn_students(id),  -- カルテ（予約時に自動生成・紐付け）
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','done')),
  source text not null default 'web',
  record_note text,                             -- 当日のレッスン記録
  handover_note text,                           -- 次回への申し送り（次回予約カードに自動表示）
  recorded_by uuid references staff(id),
  recorded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
alter table frunk_lesson_bookings enable row level security;
create index if not exists idx_frunk_lesson_bookings_member on frunk_lesson_bookings (member_id, created_at desc) where deleted_at is null;
-- 1枠1人（doneも枠を占有した実績として維持）
create unique index if not exists uq_frunk_lesson_booking on frunk_lesson_bookings (slot_id)
  where status in ('confirmed','done') and deleted_at is null;
