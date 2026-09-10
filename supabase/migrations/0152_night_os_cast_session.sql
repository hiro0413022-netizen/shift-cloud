-- 0152_night_os_cast_session.sql — キャスト用スマホのログイン（Night OS / 2026-09-09）
-- スタッフ(staff)のSupabase Authとは別系統。会員ポータル(res_member_sessions)と同じ作り:
-- cookieには生トークン、DBにはハッシュだけ置く。退店・休職はキャスト行のstatusで即無効になる。
create table if not exists nite_cast_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  cast_id uuid not null references nite_casts(id),
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists uq_nite_cast_sessions_hash on nite_cast_sessions (token_hash);
create index if not exists idx_nite_cast_sessions_cast on nite_cast_sessions (cast_id, expires_at desc);
alter table nite_cast_sessions enable row level security;

comment on table nite_cast_sessions is
  'キャスト用スマホのセッション。cookieは生トークン・DBはハッシュのみ。staffのAuthとは別系統';
