-- 0048_demo_sales.sql
-- AI DEMO SALES — クリニック・動物病院向けHP制作の営業デモ高速生成（apps/demo-sales / dms_*）
--
-- 思想: 中心価値は「営業先専用デモの高速生成」。CRM・履歴・案件管理は補助機能。
--   1) 成約可能性の高い営業先を見つける
--   2) 営業先ごとのHP案を事前に作る
--   3) 完成イメージを見せた状態で営業する
--
-- デモは一般公開しない: /d/[token] の非公開URL・noindex・DEMOラベル・有効期限・任意パスコード。
-- 既存サイトの写真・ロゴは無断利用しない（仮素材で生成し、契約後に正式素材へ差し替え）。
--
-- 追加のみ（DECISIONS #2）。RLS標準（#3）: 読みは認証ユーザ、書きは service_role。

-- 1. 料金プラン（管理画面から変更可能にするためマスタ化）
create table if not exists dms_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  key text not null,                       -- 'basic' / 'growth' 等
  name text not null,
  build_price integer not null,            -- 初期制作費（円・税抜運用はアプリ層で明示）
  monthly_fee integer not null,            -- 月額管理費（円）
  pages text,                              -- '5〜8ページ' 等
  features jsonb not null default '[]',    -- ["スマートフォン対応", ...]
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, key)
);

-- 2. 営業先（クリニック・動物病院等）
create table if not exists dms_prospects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  industry text not null,                  -- naika/dental/ortho/pediatrics/derma/eye/ent/beauty/vet/judo/other
  city text,
  address text,
  phone text,
  email text,
  website_url text,
  gmap_url text,
  contact_name text,                       -- 院長または担当者
  status text not null default 'candidate',
  -- candidate/unanalyzed/analyzing/analyzed/demo_candidate/demo_in_progress/demo_done/ready/
  -- uncontacted/contacted/reception/contact_confirming/scheduling/meeting_set/met/
  -- demo_revising/quoting/quoted/considering/recontact/won/lost/hold/unreachable/transferred
  analysis jsonb,                          -- 評価項目別の所見（スマホ対応/デザイン/導線/更新状況…）
  score integer,                           -- 総合営業スコア 0-100
  demo_priority integer,                   -- デモ作成優先度（小さいほど先）
  close_probability text,                  -- high/mid/low
  good_points text,                        -- 現サイトの良い点（営業で否定しないための正典）
  improve_points text,                     -- 改善余地
  caution_points text,                     -- 営業時の注意・否定的に伝えてはいけない点
  sales_points text,                       -- 提案しやすいポイント
  suggested_plan_key text,                 -- 推奨プラン
  est_build_price integer,
  est_monthly_fee integer,
  owner_name text not null default '古川博庸',
  last_contact_on date,
  next_contact_on date,
  next_action text,                        -- AIが提示する次の最適行動
  lost_reason text,                        -- 失注理由（蓄積して営業改善に使う）
  source text not null default 'manual',   -- manual/search/import
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_dms_prospects_status on dms_prospects(company_id, status) where deleted_at is null;

-- 3. 営業用デモサイト（1営業先に複数バージョン可）
create table if not exists dms_demos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  prospect_id uuid not null references dms_prospects(id),
  version integer not null default 1,
  token text not null unique,              -- 非公開プレビューURL /d/[token]（推測不能な乱数）
  passcode text,                           -- 任意の閲覧パスコード（先方共有時に設定）
  expires_on date,                         -- 有効期限（過ぎたら配信側が閲覧を止める）
  template_key text not null,              -- 業種別テンプレート
  brief jsonb,                             -- 生成入力（院名・診療時間・住所・強み・色・修正指示履歴）
  html text,                               -- 生成済み単一ファイルHTML（DEMOラベル/noindexは配信側でも強制）
  status text not null default 'draft',    -- draft/ready/shared/expired
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_dms_demos_prospect on dms_demos(prospect_id) where deleted_at is null;

-- 4. 営業ドキュメント（1枚提案書・電話/訪問トーク・メール・見積）
create table if not exists dms_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  prospect_id uuid not null references dms_prospects(id),
  demo_id uuid references dms_demos(id),
  kind text not null,                      -- proposal/phone_talk/visit_talk/email/thanks_mail/quote
  title text,
  content text,                            -- Markdown（見積は見出し＋表）
  meta jsonb,                              -- 見積内訳・金額等の構造データ
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_dms_documents_prospect on dms_documents(prospect_id) where deleted_at is null;

-- 5. 営業履歴（連絡・面談・修正指示・ステータス変更）
create table if not exists dms_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  prospect_id uuid references dms_prospects(id),  -- null=全体向け（営業指示 directive 等）
  kind text not null,                      -- call/visit/mail/meeting/edit_request/status/note/directive
  content text,
  meta jsonb,                              -- 面談中修正の指示原文・見積再計算差分など
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_dms_activities_prospect on dms_activities(prospect_id, created_at desc) where deleted_at is null;

-- 6. 正式制作案件（成約→再入力なしで移行。WEB DEVELOPMENT COMMAND CENTER の受け皿）
create table if not exists dms_projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  prospect_id uuid not null references dms_prospects(id) unique,
  plan_key text,
  build_price integer,
  monthly_fee integer,
  handover jsonb,                          -- 顧客情報/現サイト分析/採用デザイン/要望/面談コメント/必要素材/未確認事項
  status text not null default 'preparing',-- preparing/in_production/review/launched
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- RLS（読みは認証ユーザ、書きは service_role — cad_* と同型）
alter table dms_plans enable row level security;
alter table dms_prospects enable row level security;
alter table dms_demos enable row level security;
alter table dms_documents enable row level security;
alter table dms_activities enable row level security;
alter table dms_projects enable row level security;

drop policy if exists dms_plans_read on dms_plans;
create policy dms_plans_read on dms_plans for select to authenticated using (true);
drop policy if exists dms_prospects_read on dms_prospects;
create policy dms_prospects_read on dms_prospects for select to authenticated using (true);
drop policy if exists dms_demos_read on dms_demos;
create policy dms_demos_read on dms_demos for select to authenticated using (true);
drop policy if exists dms_documents_read on dms_documents;
create policy dms_documents_read on dms_documents for select to authenticated using (true);
drop policy if exists dms_activities_read on dms_activities;
create policy dms_activities_read on dms_activities for select to authenticated using (true);
drop policy if exists dms_projects_read on dms_projects;
create policy dms_projects_read on dms_projects for select to authenticated using (true);

-- updated_at トリガ（既存 set_updated_at を流用）
do $$
declare t text;
begin
  foreach t in array array['dms_plans','dms_prospects','dms_demos','dms_documents','dms_activities','dms_projects'] loop
    execute format('drop trigger if exists trg_%s_updated on %s', t, t);
    execute format('create trigger trg_%s_updated before update on %s for each row execute function app.set_updated_at()', t, t);
  end loop;
end $$;

-- シード: 料金プラン2種 ＋ 初期営業先13件（2026-07-14 ユーザー提供リスト）
do $$
declare
  v_cid uuid := 'ec00ad2a-4032-4061-bdb7-03face8a04e7'; -- 株式会社YOZAN
begin
  if not exists (select 1 from dms_plans where company_id = v_cid and key = 'basic') then
    insert into dms_plans(company_id, key, name, build_price, monthly_fee, pages, features, sort) values
    (v_cid, 'basic', 'ベーシックプラン', 298000, 16500, '5〜8ページ',
     '["スマートフォン対応","診療案内","初診案内","診療時間","アクセス","お知らせ更新","問い合わせまたは予約導線","サーバー・ドメイン管理","軽微な修正"]', 1),
    (v_cid, 'growth', '集患・採用強化プラン', 498000, 29800, '10〜15ページ',
     '["オリジナル構成","文章作成支援","スタッフ紹介","採用ページ","アクセス解析","月次改善提案","更新代行","予約導線改善","SEO基本設計"]', 2);
  end if;

  if not exists (select 1 from dms_prospects where company_id = v_cid) then
    insert into dms_prospects(company_id, name, industry, website_url, gmap_url, status) values
    (v_cid, '福本クリニック',       'naika',  'https://share.google/DtGf3UavtvvNz72rd', 'https://maps.app.goo.gl/eaMdw63APNVDULaYA', 'unanalyzed'),
    (v_cid, '中川クリニック',       'naika',  'https://www.itami-med.or.jp/kikan/itamidb.cgi?cmd=dp&num=94', 'https://maps.app.goo.gl/x9Vt41J6cVbLgBfb6', 'unanalyzed'),
    (v_cid, '間瀬内科クリニック',   'naika',  'https://share.google/5pxX0fEQ1wbztl9D1', 'https://maps.app.goo.gl/jV932vjj391hstva7', 'unanalyzed'),
    (v_cid, 'まきの内科クリニック', 'naika',  'https://share.google/eTPbe5Pdltmo8xAQv', 'https://maps.app.goo.gl/WQZNbhRpAzvP7k9r8', 'unanalyzed'),
    (v_cid, '田村鍼灸接骨院',       'judo',   'https://share.google/23NvZFDEOESNrbBTC', 'https://maps.app.goo.gl/t8MpNhnx6d14bFi87', 'unanalyzed'),
    (v_cid, 'たきやま整骨院',       'judo',   'https://share.google/SrICeuTyK8rGwDvef', 'https://maps.app.goo.gl/UKKnB2RmCPKTf7Wh8', 'unanalyzed'),
    (v_cid, 'ふくい歯科医院',       'dental', 'https://share.google/v5LQtmDyWr4J8EltJ', 'https://maps.app.goo.gl/AmaUsfnNq9f9hrqF6', 'unanalyzed'),
    (v_cid, '河崎歯科医院',         'dental', 'http://www.kda8020.com/j_iin/kawasaki.htm', 'https://maps.app.goo.gl/jaE2GEftUTgMy5eP8', 'unanalyzed'),
    (v_cid, 'しまづ歯科医院',       'dental', 'https://share.google/jXhWVUBBv3djzOBIa', 'https://maps.app.goo.gl/6pa4dbWinMoNR4WHA', 'unanalyzed'),
    (v_cid, 'ささき犬猫病院',       'vet',    'https://share.google/DLIpeaonIwWFPB33w', 'https://maps.app.goo.gl/H47RSazFHXfRDmcp6', 'unanalyzed'),
    (v_cid, 'はる動物病院',         'vet',    'https://share.google/hXKeJwmVCM93RkFnV', 'https://maps.app.goo.gl/thsxzeRvG8tRkDJFA', 'unanalyzed'),
    (v_cid, 'アニー動物クリニック', 'vet',    'https://share.google/OPhrKBxVSpWBIwhbI', 'https://maps.app.goo.gl/UJLqmw8TbBxxz9447', 'unanalyzed'),
    (v_cid, 'はんぞう動物病院',     'vet',    'https://share.google/L2UTIqCodk2pP24zG', 'https://maps.app.goo.gl/skuWYiwdSY4UUWyD7', 'unanalyzed');
  end if;
end $$;
