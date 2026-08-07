-- 0098_prospect_pickup.sql
-- @yozan/prospect — 営業先の自動ピックアップとWeb現況スコア（DECISIONS #110 / [[hp-sales-pipeline]] の①）
--
-- 思想: 「パソコンを閉じていても営業先が増えている」状態を作る。
--   巡回元(prs_sources) → 取得(アダプタ) → 重複除外(prs_seen) → Web現況スコア(dms_prospects.analysis/score)
--   → スコア上位は自動でデモ生成 → 判断フィードに「送るか」だけを出す。
--
-- 取得アダプタは差し替え可能にする（ユーザー選択 2026-08-07）:
--   kind='directory' … 医師会・獣医師会などの公開名簿ページを巡回（無料・いま動く）
--   kind='places'    … Google Places API（キーが入った瞬間に有効化。未設定なら黙ってskip）
--
-- 追加のみ（DECISIONS #2）。RLS標準（#3/#65）: ポリシーを作らない＝service_role のみ。

-- ============================================================
-- 1) 巡回元
-- ============================================================
create table if not exists prs_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,                          -- 「伊丹市医師会 会員名簿」等
  kind text not null default 'directory',      -- directory | places
  industry text not null,                      -- dms_prospects.industry と同じキー
  city text,
  -- directory 用
  url text,                                    -- 一覧ページURL
  link_pattern text,                           -- 詳細ページリンクを拾う正規表現（未指定=一覧ページ内の全リンク）
  -- places 用
  query text,                                  -- 検索語（例: '美容室 伊丹市'）
  -- 共通
  max_per_run integer not null default 10,     -- 1回のcronで拾う上限（急に大量に増やさない）
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_result jsonb,                           -- {picked, skipped, error} 直近の結果を画面に出す用
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint prs_sources_kind_chk check (kind in ('directory', 'places'))
);
create index if not exists idx_prs_sources_enabled on prs_sources(company_id, enabled) where deleted_at is null;
comment on table prs_sources is '営業先の巡回元。kind=directory(公開名簿ページ)/places(Google Places API)。@yozan/prospect';

-- ============================================================
-- 2) 巡回済みの参照先 — 同じ店を二度拾わないための台帳
-- ============================================================
-- 「営業先にならなかった理由」も残す。残さないと毎回同じページを取りに行って、
-- 毎回同じ理由で捨てるだけの巡回になる（外部サイトへの無駄なアクセスにもなる）。
create table if not exists prs_seen (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  source_id uuid references prs_sources(id),
  ref_key text not null,                       -- 詳細ページURL または places の place_id
  prospect_id uuid references dms_prospects(id),
  skip_reason text,                            -- duplicate / no_name / no_website / excluded / fetch_failed
  note text,
  created_at timestamptz not null default now(),
  unique (company_id, ref_key)
);
create index if not exists idx_prs_seen_source on prs_seen(source_id, created_at desc);
comment on table prs_seen is '巡回済みの参照先。prospect化した/しなかったを両方残して再訪を防ぐ（@yozan/prospect）';

-- ============================================================
-- 3) 実行ログ
-- ============================================================
create table if not exists prs_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  picked integer not null default 0,           -- 新規に営業先化した件数
  skipped integer not null default 0,
  audited integer not null default 0,          -- スコアを付けた件数
  demos integer not null default 0,            -- 自動生成したデモ件数
  detail jsonb,                                -- 巡回元ごとの内訳・エラー
  created_at timestamptz not null default now()
);
create index if not exists idx_prs_runs_company on prs_runs(company_id, started_at desc);
comment on table prs_runs is '自動ピックアップの実行ログ。止まっていることに気づけるようにする（@yozan/prospect）';

-- ============================================================
-- 4) dms_prospects の拡張
-- ============================================================
alter table dms_prospects
  add column if not exists prs_source_id uuid references prs_sources(id),
  add column if not exists source_url text,          -- 拾ってきた元ページ（後から出どころを辿れるように）
  add column if not exists audited_at timestamptz,   -- Web現況スコアの計測日時
  add column if not exists audit jsonb,              -- 機械計測の生データ（HTTP/HTML/PageSpeedの素の観測）
  add column if not exists auto_demo_at timestamptz; -- 自動でデモを作った日時（人の生成と区別する）

comment on column dms_prospects.audit is
  '機械計測の生データ。analysis は「所見」でありAIや人が書き換えるが、audit は観測値なので上書きしない（@yozan/prospect）';
comment on column dms_prospects.auto_demo_at is
  'cronが自動生成したデモの日時。人が作ったデモと区別して判断フィードの文面を変えるために持つ';

create index if not exists idx_dms_prospects_audited on dms_prospects(company_id, audited_at) where deleted_at is null;

alter table prs_sources enable row level security;
alter table prs_seen    enable row level security;
alter table prs_runs    enable row level security;
-- ポリシーは作らない＝service_role のみ（アプリ層で認可 #3 / #65）
