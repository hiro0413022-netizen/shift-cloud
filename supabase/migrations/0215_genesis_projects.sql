-- 0215: Projects（案件・#303・P4-d）
--   Memory の project スコープ、Waiting、開発依頼、判断、イベントを「案件」で束ねる入口。
--   gn_projects（案件そのもの）＋ gn_project_items（案件に紐づくもの・既存表は変えずリンク表で持つ）。
--   追加のみ。

create table if not exists gn_projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  slug text not null,                    -- 'gw-2nd-store' / 'frank-24h'
  goal text,                             -- 何をもって完了か（1〜2文）
  status text not null default 'active' check (status in ('active', 'paused', 'done', 'cancelled')),
  owner_staff_id uuid references staff(id),
  store_id uuid references stores(id),
  due_on date,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, slug)
);
alter table gn_projects enable row level security;
create policy gn_projects_tenant on gn_projects for all to authenticated using (company_id = app.current_company_id()) with check (company_id = app.current_company_id());
comment on table gn_projects is 'Genesis: 案件（Project スコープの入口）。Memory の scope=project は scope_id=この id #303';

create table if not exists gn_project_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  project_id uuid not null references gn_projects(id),
  kind text not null check (kind in ('waiting', 'devreq', 'decision', 'memory', 'event', 'note', 'link', 'document')),
  ref_id text,                           -- 紐づく行の id（note / link は null 可）
  label text not null,                   -- 一覧に出す1行
  url text,                              -- link / document のとき
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_gn_project_items_project on gn_project_items (project_id, created_at desc) where deleted_at is null;
alter table gn_project_items enable row level security;
create policy gn_project_items_tenant on gn_project_items for all to authenticated using (company_id = app.current_company_id()) with check (company_id = app.current_company_id());

-- Ask Data から（hq）
create or replace view gnv_projects as
  select p.id, p.name, p.slug, p.goal, p.status, p.due_on, p.created_at, p.updated_at,
         (select count(*) from gn_project_items i where i.project_id = p.id and i.deleted_at is null) as items
  from gn_projects p
  where p.company_id = gn_ctx_company() and p.deleted_at is null and gn_ctx_is_hq();
revoke all on gnv_projects from public;
grant select on gnv_projects to gn_chat_reader;
grant select on gnv_projects to service_role;

-- 初期の案件（YOZAN のみ・名前と目的は既知のものだけ）
insert into gn_projects (company_id, name, slug, goal, status)
select c.id, v.name, v.slug, v.goal, 'active'
from companies c
cross join (values
  ('GOLF WING 2号店 出店計画', 'gw-2nd-store', '2号店の出店判断に必要な計画（打席数・投資・借入）をそろえる'),
  ('FRANK GOLF 24時間営業化', 'frank-24h', 'QR コード入館＋スマートロックで無人時間帯の営業を始める'),
  ('Genesis Transformation', 'genesis-transformation', 'Genesis を「システムを選ぶソフト」から「目的を伝えれば動く AI OS」へ（Core / Tool / Skill / Memory）')
) as v(name, slug, goal)
where c.deleted_at is null and c.name = '株式会社YOZAN'
on conflict (company_id, slug) do nothing;
