-- 店舗ダッシュボード（/store）用ログインID＋パスワード（DECISIONS #76）
-- 店頭PCが Shift Cloud のログイン画面から「店舗用ID＋パスワード」で店舗ダッシュボードを
-- 開くための資格情報。スタッフ認証（Supabase auth）とは別系統で、成功時はHMAC署名Cookie
-- （sd_session）を発行し /store（URLにトークンを出さない）を表示する。
-- 認証・書込みは service_role（admin client）経由のみ。RLSはポリシーなしで全拒否。
create table if not exists store_dash_logins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  login_id text not null,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ログインIDは会社をまたいで一意（大文字小文字無視・論理削除は除外）
create unique index if not exists store_dash_logins_login_id_key
  on store_dash_logins (lower(login_id))
  where deleted_at is null;

create index if not exists store_dash_logins_company_idx
  on store_dash_logins (company_id)
  where deleted_at is null;

alter table store_dash_logins enable row level security;
-- ポリシーは作成しない: anon / authenticated からは全拒否。service_role のみ。
