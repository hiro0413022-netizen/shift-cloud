-- ============================================================
-- 0088: Money OS — 担当プロ名簿（店舗別）
--
-- 背景:
--   売上入力（mon_sales）に「担当プロ」を付けたい（Excel売上一覧の担当プロ列。SYSTEM.md §4-2）。
--   担当プロはシステムユーザーとは限らない（ログインしない外部プロもいる）ため、
--   staff とは独立した「店舗ごとの名簿」として持つ。money-os の設定画面で追加・編集する。
--
-- 方針:
--   - RLSは有効・ポリシーなし＝service_role専用（本リポジトリの標準形 #65）
--   - 売上側は mon_sales.detail.pro に名前スナップショットで保存（名簿を消しても過去明細は壊れない）
-- ============================================================

create table if not exists mon_pros (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  name text not null,
  sort_order integer not null default 100,
  active boolean not null default true,     -- false = 退任等。新規入力の選択肢から外す（過去明細はそのまま）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_mon_pros_name
  on mon_pros(store_id, name) where deleted_at is null;
create index if not exists idx_mon_pros_store
  on mon_pros(company_id, store_id, sort_order) where deleted_at is null;

alter table mon_pros enable row level security;

comment on table mon_pros is 'Money OS: 売上の担当プロ名簿（店舗別）。/settings で管理。売上側は detail.pro に名前で保存';
comment on column mon_pros.active is 'false=選択肢から外す（論理削除と違い一覧には残る）';
