-- 0114_pgw_pro_site.sql
-- PRO SITE（プロゴルファー公式HP・外販SaaS）: apps/pro-site
-- 1プロ=1テナント（pgw_pros が親）。スタッフ認証(companies/staff)とは独立した外販商品。
-- アクセスは全て service_role 経由（RLS有効・ポリシー無し＝0064/0065以降の標準）。
-- 認証: pgw_pros.password_hash（scrypt）＋署名Cookie。編集はプロ本人がスマホから。
-- Instagram: Meta API不要の「投稿URL貼り付け→公式embed.js表示」方式（#127 Meta停止中のため）。

-- ============================================================
-- 1. pgw_pros — プロ本人（テナント親）
-- ============================================================
create table pgw_pros (
  id uuid primary key default gen_random_uuid(),
  slug text not null,                        -- URL: /{slug}
  name text not null,                        -- 榎本剛志
  name_en text,                              -- TSUYOSHI ENOMOTO
  catchphrase text,                          -- トップのひとこと
  bio text,                                  -- BIOGRAPHY（自由文）
  affiliation text,                          -- 所属
  instagram_username text,
  x_username text,
  youtube_url text,
  hero_image_url text,
  profile_image_url text,
  world_ranking text,                        -- 表示文字列（例: 世界ランキング 812位）
  ranking_note text,
  password_hash text not null,               -- scrypt salt:hash
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index idx_pgw_pros_slug on pgw_pros (slug) where deleted_at is null;

-- ============================================================
-- 2. pgw_profile_items — プロフィール表（key/value。項目はプロごとに自由）
-- ============================================================
create table pgw_profile_items (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references pgw_pros(id),
  label text not null,
  value text not null default '',
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pgw_profile_items_pro on pgw_profile_items (pro_id, sort) where deleted_at is null;

-- ============================================================
-- 3. pgw_news — ニュース / メディア出演（kind で区別）
-- ============================================================
create table pgw_news (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references pgw_pros(id),
  kind text not null default 'news' check (kind in ('news', 'media')),
  category text not null default 'お知らせ',
  title text not null,
  body text,
  link_url text,
  published_at date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pgw_news_pro on pgw_news (pro_id, kind, published_at desc) where deleted_at is null;

-- ============================================================
-- 4. pgw_tournaments — 大会（SCHEDULE/RESULTは end_date と今日の比較で自動振り分け）
-- ============================================================
create table pgw_tournaments (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references pgw_pros(id),
  name text not null,
  tour text,                                 -- 例: 2026 JapanTOUR
  venue text,
  start_date date not null,
  end_date date not null,
  result_rank text,                          -- 例: 優勝 / 5位T / 予選落ち
  result_detail text,                        -- 例: 通算-12（68・70・66・68）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pgw_tournaments_pro on pgw_tournaments (pro_id, start_date desc) where deleted_at is null;

-- ============================================================
-- 5. pgw_career — 主な戦歴（PROFILEページの表）
-- ============================================================
create table pgw_career (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references pgw_pros(id),
  season text,                               -- 例: 2019-20
  event text not null,
  result text,                               -- 例: 優勝
  note text,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pgw_career_pro on pgw_career (pro_id, sort) where deleted_at is null;

-- ============================================================
-- 6. pgw_clubs — クラブセッティング
-- ============================================================
create table pgw_clubs (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references pgw_pros(id),
  category text not null,                    -- ドライバー / アイアン / パター …
  item text not null,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pgw_clubs_pro on pgw_clubs (pro_id, sort) where deleted_at is null;

-- ============================================================
-- 7. pgw_instagram — HPに表示するInstagram投稿URL
-- ============================================================
create table pgw_instagram (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references pgw_pros(id),
  post_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pgw_instagram_pro on pgw_instagram (pro_id, created_at desc) where deleted_at is null;

-- ============================================================
-- updated_at トリガー＋RLS（ポリシー無し=service_role専用）
-- ============================================================
create trigger set_updated_at before update on pgw_pros for each row execute function app.set_updated_at();
create trigger set_updated_at before update on pgw_profile_items for each row execute function app.set_updated_at();
create trigger set_updated_at before update on pgw_news for each row execute function app.set_updated_at();
create trigger set_updated_at before update on pgw_tournaments for each row execute function app.set_updated_at();
create trigger set_updated_at before update on pgw_career for each row execute function app.set_updated_at();
create trigger set_updated_at before update on pgw_clubs for each row execute function app.set_updated_at();
create trigger set_updated_at before update on pgw_instagram for each row execute function app.set_updated_at();

alter table pgw_pros enable row level security;
alter table pgw_profile_items enable row level security;
alter table pgw_news enable row level security;
alter table pgw_tournaments enable row level security;
alter table pgw_career enable row level security;
alter table pgw_clubs enable row level security;
alter table pgw_instagram enable row level security;
