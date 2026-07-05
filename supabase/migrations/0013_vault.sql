-- 0013_vault.sql
-- システム台帳（Vault）: 関連システム・サイトのURL/ログイン情報/パスワードを一元管理
-- セキュリティ: RLSポリシーを意図的に作らない = service_role専用（authenticatedからは読み書き不可）
-- 画面アクセスは view_hq + Vaultパスワード（VAULT_PASSWORD env、既定 hiro1025 のsha256照合）の二重ゲート
-- 秘密情報はこのリポジトリには一切書かない（Public運用 DECISIONS #14）。値はDBのみに保存

create table vault_systems (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  category text not null default 'other', -- dev / site / mail / saas / other
  url text,
  login_id text,
  password text,
  notes text,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_vault_systems_company on vault_systems (company_id, sort_order);

create trigger set_updated_at before update on vault_systems
  for each row execute function app.set_updated_at();

alter table vault_systems enable row level security;
-- policyなし（service_roleのみアクセス可）: 給与系テーブルと同様の保護方針（DECISIONS #3の例外扱い）
