-- 0080: サイトCMS（#85 FRANK §3-1）。HPの可変データ（window.FRANK overrides + news）をDBで管理し、
-- Genesisの /site-admin から編集→静的サイトが公開APIで読み込む。適用済（MCP経由 2026-07-26）。
create table if not exists gn_site_content (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  site text not null,
  data jsonb not null default '{}'::jsonb,
  news jsonb not null default '[]'::jsonb,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, site)
);
alter table gn_site_content enable row level security;
insert into gn_site_content (company_id, site, data, news)
values ('ec00ad2a-4032-4061-bdb7-03face8a04e7', 'frank-golf', '{}'::jsonb, '[]'::jsonb)
on conflict (company_id, site) do nothing;
