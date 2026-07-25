-- 0077: Vercel Deploy Hook の保存先（#81）
-- URLは実質シークレットのため本ファイルに書かない（公開リポジトリ）。登録はSQL直実行。
-- prod_deploy ハンドラがここを参照（env VERCEL_DEPLOY_HOOKS はフォールバック）。

create table if not exists gn_deploy_hooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  project text not null,
  hook_url text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, project)
);

alter table gn_deploy_hooks enable row level security;
-- ポリシー無し = service_role専用
