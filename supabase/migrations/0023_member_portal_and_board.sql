-- 0023_member_portal_and_board.sql
-- 会員マイページ（会員番号+生年月日ログイン・仮会員自己登録）と店頭常設カレンダー（boardトークン）
-- member-os / 姫路 FRUNK GOLF。DECISIONS #24/#28 の次フェーズ。既存標準準拠(#11/#12/#17)。

-- 1. res_tokens に用途を追加（book=お客様Web予約 / board=店頭掲示カレンダー）
alter table res_tokens
  add column if not exists purpose text not null default 'book'
  check (purpose in ('book', 'board'));

-- 2. 仮会員（マイページからの自己登録。Smart Hello会員マスタ(mbr_members)は再取込で全件洗い替えされるため別テーブルに保持）
create table mbr_provisional_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  member_no text not null,                -- 自動採番 'P' + 8桁
  name text not null,
  name_kana text,
  birth_date date,
  phone text,
  email text,
  linked_member_no text,                  -- 後日Smart Hello実会員と突合できたらその番号
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_prov_member_no on mbr_provisional_members (company_id, member_no);

-- 3. 会員セッション（cookieの生トークンはsha256のみ保持。DECISIONS #12準拠）
create table res_member_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  member_no text not null,
  is_provisional boolean not null default false,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index idx_member_session_hash on res_member_sessions (token_hash);
create index idx_member_session_member on res_member_sessions (company_id, member_no);

-- triggers + RLS
create trigger set_updated_at before update on mbr_provisional_members for each row execute function app.set_updated_at();
do $$
declare t text;
begin
  foreach t in array array['mbr_provisional_members', 'res_member_sessions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;
