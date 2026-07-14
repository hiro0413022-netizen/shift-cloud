-- 0043_lesson_os_p2.sql
-- Lesson OS P2: PGA NOTE準拠の大型アップデート（DECISIONS #50・適用済）
-- 生徒プロフィール/スキル(JSONB)・顔写真・進捗カリキュラム(9項目%＋レーダー)・
-- お手本スイング・生徒共有リンク・動画描画注釈・飛距離

alter table lsn_students add column if not exists photo_path text;
alter table lsn_students add column if not exists profile jsonb not null default '{}'::jsonb;
alter table lsn_students add column if not exists skill jsonb not null default '{}'::jsonb;
alter table lsn_videos add column if not exists distance_yd integer;
alter table lsn_videos add column if not exists annotations jsonb;

create table if not exists lsn_progress_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists lsn_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  student_id uuid not null references lsn_students(id),
  item_id uuid not null references lsn_progress_items(id),
  percent integer not null default 0 check (percent between 0 and 100),
  updated_at timestamptz not null default now(),
  unique (student_id, item_id)
);
create table if not exists lsn_model_videos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  coach_staff_id uuid not null references staff(id),
  storage_path text not null,
  club text,
  distance_yd integer,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists lsn_share_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  student_id uuid not null references lsn_students(id),
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists idx_lsn_share_student on lsn_share_tokens (student_id) where revoked_at is null;

alter table lsn_progress_items enable row level security;
alter table lsn_progress enable row level security;
alter table lsn_model_videos enable row level security;
alter table lsn_share_tokens enable row level security;
do $$
declare t text;
begin
  foreach t in array array['lsn_progress_items', 'lsn_progress', 'lsn_model_videos', 'lsn_share_tokens']
  loop
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- 既定カリキュラム9項目（PGA NOTE準拠）
insert into lsn_progress_items (company_id, name, sort)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7', v.name, v.sort
from (values ('グリップ',1),('アドレス',2),('テイクバック',3),('バックスイング',4),('トップオブスイング',5),('ダウンスイング',6),('インパクト',7),('フォロースルー',8),('フィニッシュ',9)) as v(name,sort)
where not exists (select 1 from lsn_progress_items where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7');
