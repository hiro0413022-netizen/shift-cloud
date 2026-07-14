-- 0041_lesson_os.sql
-- Lesson OS — スイング動画・コーチコメント管理（WING NOTE代替 / DECISIONS #49）
--
-- 目的: WING NOTE（外部サービス）で行っているレッスンカルテを自社化する。
--   (1) lsn_students     … 生徒台帳（Smart Hello会員番号で会員名簿と疎結合）
--   (2) lsn_videos       … スイング動画（Storage lesson-videos、署名URL直PUT）
--   (3) lsn_comments     … コーチコメント（動画に紐づく）
--   (4) lsn_measurements … 計測データの受け口（Trackman等、JSONBで柔軟に / 後続で取込実装）
-- 追加のみ（DECISIONS #2）。動画キーは日本語不可のためbase64urlエンコード（libraryと同方式）。

create table if not exists lsn_students (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  name text not null,
  name_kana text,
  member_code text,                -- Smart Hello会員番号（会員名簿との疎結合キー）
  memo text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_lsn_students_company on lsn_students (company_id, status, name) where deleted_at is null;

create table if not exists lsn_videos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  student_id uuid not null references lsn_students(id),
  storage_path text not null,      -- lesson-videos/{company}/{student}/{ts}_{enc(name)}
  title text,
  shot_at date,                    -- 撮影日
  club text,                       -- 使用クラブ（DR/7I等、自由入力）
  note text,
  size_bytes bigint,
  uploaded_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_lsn_videos_student on lsn_videos (student_id, shot_at desc) where deleted_at is null;

create table if not exists lsn_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  video_id uuid not null references lsn_videos(id),
  coach_staff_id uuid not null references staff(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_lsn_comments_video on lsn_comments (video_id, created_at) where deleted_at is null;

-- Trackman等の計測データ受け口（取込はフェーズ3。CSV/APIをJSONBに正規化して入れる）
create table if not exists lsn_measurements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  student_id uuid not null references lsn_students(id),
  video_id uuid references lsn_videos(id),   -- 動画に紐づけられる（任意）
  source text not null default 'trackman' check (source in ('trackman', 'manual', 'other')),
  measured_at timestamptz,
  club text,
  data jsonb not null default '{}'::jsonb,   -- ボールスピード/打ち出し角/スピン量等
  imported_by uuid references staff(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_lsn_measurements_student on lsn_measurements (student_id, measured_at desc) where deleted_at is null;

-- 動画バケット（プライベート・service_role専用）
insert into storage.buckets (id, name, public) values ('lesson-videos', 'lesson-videos', false)
on conflict (id) do nothing;

-- RLS（テナント標準）
alter table lsn_students enable row level security;
alter table lsn_videos enable row level security;
alter table lsn_comments enable row level security;
alter table lsn_measurements enable row level security;
do $$
declare t text;
begin
  foreach t in array array['lsn_students', 'lsn_videos', 'lsn_comments', 'lsn_measurements']
  loop
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;
