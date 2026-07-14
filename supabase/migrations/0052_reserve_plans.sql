-- 0052_reserve_plans.sql
-- 予約OS: サービス配下の「メニュー（コマ数・料金）」を持てるようにする（DECISIONS #57）。
--
-- 背景: GOLF WINGのフィッティングは実際には3メニューある（1コマ55分/2コマ110分/アイアン）。
--   res_services 1行 = 料金1つ の構造では表現できなかった（¥5,500・60分は誤り）。
--   お客様には1ページで3メニューを提示し、フォームで選んでもらう（LIFF URLを1本のまま使える）。

create table res_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  service_id uuid not null references res_services(id),
  code text not null,                 -- 内部識別（shaft_1 / shaft_2 / iron）
  name text not null,                 -- 表示名（例: シャフトフィッティング 1コマ）
  summary text,                       -- 補足（例: ドライバー/FW/UTのうち1種類）
  target_clubs text,                  -- 対象クラブ
  duration_min integer,               -- 所要時間（分）
  price integer not null,             -- 料金（円・税込）
  price_note text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index idx_res_plans_code on res_plans (service_id, code) where deleted_at is null;

create trigger set_updated_at before update on res_plans for each row execute function app.set_updated_at();

alter table res_plans enable row level security;
create policy tenant_select on res_plans for select to authenticated using (company_id = app.current_company_id());
create policy tenant_insert on res_plans for insert to authenticated with check (company_id = app.current_company_id());
create policy tenant_update on res_plans for update to authenticated using (company_id = app.current_company_id());

-- 申込がどのメニューかを持つ（金額は申込時点のスナップショット＝後から料金改定しても履歴が壊れない）
alter table res_requests add column if not exists plan_id uuid references res_plans(id);
alter table res_requests add column if not exists plan_name text;
alter table res_requests add column if not exists plan_price integer;

-- サービス本体は「入れ物」に。料金・所要時間はプラン側が正（誤った¥5,500/60分を消す）
update res_services
set name = 'フィッティング',
    summary = '弾道計測とプロの試打診断で、あなたに最適な1本を見つける専門フィッティング。',
    target_clubs = 'ドライバー / フェアウェイウッド / ユーティリティ / アイアン',
    price = null,
    duration_min = null,
    price_note = null,
    lead_text = '「飛距離が伸びない」「方向性が安定しない」——その原因はクラブかもしれません。GOLF WINGのフィッティングで、数値とプロの目から、あなたに最適な1本をご提案します。'
where slug = 'shaft-fitting';

insert into res_plans (company_id, service_id, code, name, summary, target_clubs, duration_min, price, sort_order)
select s.company_id, s.id, v.code, v.name, v.summary, v.target_clubs, v.duration_min, v.price, v.sort_order
from res_services s
cross join (values
  ('shaft_1', 'シャフトフィッティング 1コマ', 'クラブ1種類のシャフトフィッティング', 'ドライバー / フェアウェイウッド / ユーティリティ のうち1種類', 55, 16500, 1),
  ('shaft_2', 'シャフトフィッティング 2コマ', 'クラブ2種類以上のシャフトフィッティング', 'ドライバー / フェアウェイウッド / ユーティリティ から2種類以上', 110, 22000, 2),
  ('iron',    'アイアンフィッティング',       'アイアンのフィッティング',               'アイアン', 55, 16500, 3)
) as v(code, name, summary, target_clubs, duration_min, price, sort_order)
where s.slug = 'shaft-fitting' and s.deleted_at is null;
