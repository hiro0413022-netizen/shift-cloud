-- 0032_reserve_os.sql
-- 予約OS（reserve-os）— ビジター向け「申込型」予約。第一弾: GOLF WING シャフトフィッティング。
-- ※本番DBへは Supabase MCP apply_migration（name=reserve_os）で適用済み（2026-07-09）。
-- 既存 res_bookings（姫路FRUNK=即時枠予約）とは別概念:
--   本テーブルは「第3希望まで＋事前ヒアリング → スタッフ目視で確定」の申込モデル。
-- 他サービス（クラブFT/体験レッスン等）にも res_services.category / slug で流用可能。
-- 標準準拠: 共通カラム / RLS(app.current_company_id) / set_updated_at。DECISIONS #24,#34。

-- 1) サービスカタログ（メニュー・料金の源泉、公開ページの表示内容も駆動）
create table res_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  slug text not null,                 -- 公開URL: /reserve/<slug>
  name text not null,                 -- 例: シャフトフィッティング
  category text not null default 'shaft_fitting'
    check (category in ('shaft_fitting','club_fitting','trial_lesson','other')),
  summary text,                       -- サービス概要（1-2文）
  target_clubs text,                  -- 対象クラブ
  duration_min integer,               -- 所要時間（分）
  price integer,                      -- 料金（円・税込）
  price_note text,                    -- 料金補足
  lead_text text,                     -- 公開ページ導入文
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index idx_res_services_slug on res_services (company_id, slug) where deleted_at is null;

-- 2) 予約申込（第3希望まで＋事前ヒアリング）
create table res_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  service_id uuid references res_services(id),
  request_seq bigint generated always as identity,  -- 受付番号（人向け）
  service_category text,
  service_name text,
  name text not null,
  name_kana text,
  phone text,
  email text,
  handedness text check (handedness in ('right','left')),
  age integer,
  avg_score text,
  pref1_at timestamptz not null,
  pref2_at timestamptz,
  pref3_at timestamptz,
  head_speed text,
  club_maker text,
  club_model text,
  club_shaft text,
  club_flex text,
  golf_experience text,
  concern text,
  improvement text,
  target_distance text,
  bring_clubs text,
  other_notes text,
  intake jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','confirmed','declined','canceled','completed')),
  confirmed_at timestamptz,
  confirmed_slot integer,
  staff_note text,
  source text not null default 'web' check (source in ('web','line','staff')),
  notified_at timestamptz,
  ack_sent_at timestamptz,
  handled_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_res_requests_status on res_requests (company_id, status, created_at desc) where deleted_at is null;
create index idx_res_requests_service on res_requests (service_id) where deleted_at is null;

-- 3) トリガー
create trigger set_updated_at before update on res_services for each row execute function app.set_updated_at();
create trigger set_updated_at before update on res_requests for each row execute function app.set_updated_at();

-- 4) RLS（テナント分離。公開insertはservice_role経由のためポリシー対象外）
do $$
declare t text;
begin
  foreach t in array array['res_services','res_requests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- 5) GOLF WING シャフトフィッティングを seed
insert into res_services (company_id, slug, name, category, summary, target_clubs, duration_min, price, price_note, lead_text, sort_order)
values (
  'ec00ad2a-4032-4061-bdb7-03face8a04e7',
  'shaft-fitting',
  'シャフトフィッティング',
  'shaft_fitting',
  '弾道計測とプロの試打診断で、あなたのスイングに最適な1本を見つけるシャフト専門フィッティング。',
  'ドライバー / フェアウェイウッド / ユーティリティ / アイアン',
  60,
  5500,
  'クラブ・シャフトのご購入で試打料は実質無料になります（詳細は当日ご案内）。',
  '「飛距離が伸びない」「方向性が安定しない」——その原因はシャフトかもしれません。GOLF WINGのシャフトフィッティングで、数値とプロの目から、あなたに最適な1本をご提案します。',
  1
);

-- 6) Vault台帳へ登録（システム台帳 /vault、DECISIONS #26）
insert into vault_systems (company_id, name, category, url, notes, sort_order)
values (
  'ec00ad2a-4032-4061-bdb7-03face8a04e7',
  'Reserve OS（予約OS）',
  'saas',
  'https://reserve-os.vercel.app',
  'ビジター向け申込型予約。第一弾GOLF WINGシャフトFT。公開: /reserve/shaft-fitting／スタッフ: /login（use_reception|view_hq）。メール: RESEND_API_KEY / RESERVE_FROM_EMAIL(yozan) / RESERVE_STAFF_EMAIL(golfwing)。',
  120
);
