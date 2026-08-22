-- 0115_pgw_sponsors.sql
-- PRO SITE: スポンサーバナー（#137b）。管理画面から画像アップロード→公開サイトに表示。
-- 画像は storage バケット pgw-sponsors（public読み・書き込みはservice_roleのみ=ポリシー無し）。

create table pgw_sponsors (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references pgw_pros(id),
  name text not null,                        -- スポンサー名（alt表示にも使用）
  image_url text not null,                   -- storage公開URL
  image_path text not null,                  -- バケット内パス（削除用）
  link_url text,                             -- バナーのリンク先（任意）
  size text not null default 'medium' check (size in ('large', 'medium', 'small')),
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pgw_sponsors_pro on pgw_sponsors (pro_id, sort) where deleted_at is null;

create trigger set_updated_at before update on pgw_sponsors for each row execute function app.set_updated_at();
alter table pgw_sponsors enable row level security;

-- 公開読み取りバケット（アップロード/削除はサーバー(service_role)のみ）
insert into storage.buckets (id, name, public)
values ('pgw-sponsors', 'pgw-sponsors', true)
on conflict (id) do nothing;
