-- 0057_demo_sales_quotes.sql
-- AI DEMO SALES — 見積（プラン＋オプション）。DECISIONS #54 の続き。
--
-- 思想: 営業現場で「その場で金額を出せる」ようにする。
--   ・基本料金（dms_plans）＋オプション（dms_options）の単価はすべて画面から変更できる（DB直接編集をやめる）
--   ・見積は dms_quotes に版として残す（面談中の出し直しに対応）
--   ・金額は税抜で保持し、値引 → 消費税 → 税込合計 の順に計算（税率は dms_quote_settings.tax_rate）
--   ・初期費用（build）と月額（monthly）は最後まで別集計（見積書でも分けて表示）
--
-- 追加のみ（#2）。RLS標準（#3）: 読みは認証ユーザ、書きは service_role。

-- 1. オプション単価マスタ
create table if not exists dms_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  key text not null,                        -- 'sns_ops' 等
  name text not null,                       -- 見積書に出る品名
  category text not null default 'other',   -- sns/reserve/branding/content/seo/support/other
  description text,                         -- 見積書の摘要・営業トーク用の一言
  build_price integer not null default 0,   -- 初期費用（円・税抜）
  monthly_fee integer not null default 0,   -- 月額（円・税抜）
  unit text not null default '式',          -- 式/ページ/本/回 等
  default_qty integer not null default 1,
  recommended boolean not null default false, -- 提案時に既定でチェック
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, key)
);
create index if not exists idx_dms_options_company on dms_options(company_id) where deleted_at is null;

-- 2. 見積（版管理）
create table if not exists dms_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  prospect_id uuid not null references dms_prospects(id),
  quote_no text not null,                   -- 表示用番号（YZ-20260714-XXXX）
  version integer not null default 1,
  issue_date date not null default current_date,
  valid_days integer not null default 30,   -- 見積有効期限（日）
  plan_key text,
  plan_name text,
  plan_build integer not null default 0,    -- 税抜
  plan_monthly integer not null default 0,  -- 税抜
  items jsonb not null default '[]',        -- [{key,name,unit,qty,build,monthly,description}]（税抜単価）
  discount_build integer not null default 0,
  discount_monthly integer not null default 0,
  tax_rate numeric(4,3) not null default 0.10,
  subtotal_build integer not null default 0,   -- 値引前・税抜
  subtotal_monthly integer not null default 0,
  total_build integer not null default 0,      -- 税込（値引後）
  total_monthly integer not null default 0,
  note text,
  status text not null default 'draft',     -- draft/sent/accepted/rejected
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_dms_quotes_prospect on dms_quotes(prospect_id) where deleted_at is null;

-- 3. 見積書の発行元情報・既定値（設定画面から編集）
create table if not exists dms_quote_settings (
  company_id uuid primary key references companies(id),
  issuer_name text not null default '株式会社YOZAN',
  issuer_address text,
  issuer_tel text,
  issuer_email text,
  issuer_note text,                          -- 振込先・支払条件など
  footer_note text,                          -- 見積書末尾の注記
  tax_rate numeric(4,3) not null default 0.10,
  valid_days integer not null default 30,
  updated_at timestamptz not null default now()
);

alter table dms_options enable row level security;
alter table dms_quotes enable row level security;
alter table dms_quote_settings enable row level security;
do $$
declare t text;
begin
  foreach t in array array['dms_options','dms_quotes','dms_quote_settings'] loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (true)', t, t);
    execute format('revoke insert, update, delete on %I from authenticated', t);
  end loop;
end $$;

-- シード: 発行元設定＋オプション15種（金額はすべて設定画面から変更可能・税抜）
do $$
declare
  v_cid uuid := 'ec00ad2a-4032-4061-bdb7-03face8a04e7'; -- 株式会社YOZAN
begin
  insert into dms_quote_settings(company_id, issuer_name, issuer_note, footer_note)
  values (v_cid, '株式会社YOZAN',
    'お支払い: 制作着手時に50%、公開時に50%（月額費用は公開月の翌月より発生）',
    '本見積の金額はすべて税抜表示です。掲載内容・ページ数の変更により金額が変動する場合があります。')
  on conflict (company_id) do nothing;

  if not exists (select 1 from dms_options where company_id = v_cid) then
    insert into dms_options(company_id, key, name, category, description, build_price, monthly_fee, unit, recommended, sort) values
    (v_cid,'sns_ops','SNS運用代行（月8投稿）','sns','Instagram・Facebookの投稿作成と運用代行（画像作成・文章作成込み）',50000,30000,'式',true,10),
    (v_cid,'sns_setup','SNSアカウント開設・初期設定','sns','プロフィール整備、アイコン/ヘッダー作成、初回投稿5件',50000,0,'式',false,20),
    (v_cid,'reserve_system','Web予約システム導入','reserve','24時間受付の予約フォーム。自動返信メール・予約枠管理つき',80000,5000,'式',true,30),
    (v_cid,'line_official','LINE公式アカウント連携','reserve','リッチメニュー作成・自動応答・予約導線の設置',60000,5000,'式',false,40),
    (v_cid,'logo','ロゴ制作','branding','3案提示・修正2回・各種データ納品',80000,0,'式',false,50),
    (v_cid,'photo','写真撮影（半日）','branding','院内・スタッフ・診療風景の撮影、レタッチ済データ納品',60000,0,'回',true,60),
    (v_cid,'page_add','ページ追加','content','標準構成に含まれないページの追加（1ページあたり）',20000,0,'ページ',false,70),
    (v_cid,'recruit_page','採用ページ制作','content','募集要項・スタッフの声・応募フォーム',80000,0,'式',false,80),
    (v_cid,'blog_ops','ブログ・お知らせ更新代行（月2本）','content','記事作成・写真選定・掲載まで代行',0,15000,'式',false,90),
    (v_cid,'form_upgrade','問い合わせフォーム強化','content','自動返信・項目カスタマイズ・添付対応',30000,0,'式',false,100),
    (v_cid,'seo','SEO対策（内部対策＋月次レポート）','seo','キーワード設計・内部最適化・順位レポート',30000,20000,'式',false,110),
    (v_cid,'gbp','Googleビジネスプロフィール運用','seo','投稿代行・口コミ返信の文面支援・情報最新化',20000,15000,'式',true,120),
    (v_cid,'analytics','アクセス解析レポート（月次）','seo','閲覧数・電話タップ数・予約導線の効果測定',0,10000,'式',false,130),
    (v_cid,'multilingual','多言語対応（英語）','content','主要ページの英語版を用意',60000,0,'式',false,140),
    (v_cid,'support_plus','保守プラス（更新無制限・優先対応）','support','更新依頼の回数無制限、当日〜翌営業日対応',0,10000,'式',false,150);
  end if;
end $$;
