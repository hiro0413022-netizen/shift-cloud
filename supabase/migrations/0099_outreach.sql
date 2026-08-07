-- 0099_outreach.sql
-- @yozan/outreach — 営業メールの自動送信（DECISIONS #111 / [[hp-sales-pipeline]] の②）
--
-- 思想: 「送る」を人の稼働から外す。ただし**メールは取り消せない**ので、
--   止めるための構造（抑止リスト・ウォームアップ上限・自動停止）を送る構造と同時に作る。
--
-- 法的前提（特定電子メール法）:
--   3条1項3号 … 自社サイトに電子メールアドレスを公表している営業者へは、同意なく送信できる。
--                ただし「営業メールお断り」等の表示がある先は除外。
--                → だから out_messages は「そのアドレスをどこで見つけたか(email_source)」を必ず持つ。
--   4条      … 送信者の氏名・名称、住所、受信拒否の通知先を本文に表示する義務。
--                → 文面組立(compose.ts)が companies.settings.invoice から自動で付ける。省略できない作りにする。
--
-- 追加のみ（DECISIONS #2）。RLS標準（#3/#65）: ポリシーを作らない＝service_role のみ。

-- ============================================================
-- 1) 送信設定（1社1行）— キルスイッチとウォームアップの本体
-- ============================================================
create table if not exists out_settings (
  company_id uuid primary key references companies(id),
  -- 既定は false。送信ドメインの認証(SPF/DKIM/DMARC)が済む前に送ると一発で信用を失うため、
  -- 「作った瞬間に送り始める」ことを構造的に禁じる。ONにするのは画面から1回だけ。
  enabled boolean not null default false,
  from_email text,                              -- 例: web@send.yozan-group.jp
  from_name text not null default '株式会社YOZAN',
  reply_to text,                                -- 返信の受け口（既定: info@yozan-group.jp）
  daily_cap_max integer not null default 50,    -- ウォームアップ完了後の1日あたり上限
  warmup_start date,                            -- 初回送信日。ここからの経過日数で当日の上限が決まる
  send_hour_jst integer not null default 10,    -- 送信する時間帯（JST）。深夜に届かないようにする
  -- 自動停止（キルスイッチ）
  paused_at timestamptz,
  paused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint out_settings_hour_chk check (send_hour_jst between 0 and 23)
);
comment on table out_settings is '営業メールの送信設定。enabled は既定false＝ドメイン認証前に送れない（@yozan/outreach）';

-- ============================================================
-- 2) 文面テンプレート
-- ============================================================
create table if not exists out_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  key text not null,                            -- 'default' / 'vet' 等
  name text not null,
  industry text,                                -- null = 全業種の既定
  subject text not null,
  body text not null,                           -- 差込: {{name}} {{improve}} {{demoUrl}} {{owner}} 等
  enabled boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, key)
);
comment on table out_templates is '営業メールの文面。法定表示と配信停止リンクは compose 側が必ず付けるので本文には書かない';

-- ============================================================
-- 3) 送信ログ — 1通1行。「送ったつもり」を作らないための台帳
-- ============================================================
create table if not exists out_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  prospect_id uuid references dms_prospects(id),
  demo_id uuid references dms_demos(id),
  to_email text not null,
  from_email text not null,
  subject text not null,
  body_text text not null,
  status text not null default 'queued',
  -- queued（送信予定）/ sent（API受理）/ delivered（着信）/ opened / bounced / complained（迷惑報告）/ failed / canceled
  provider_id text,                             -- Resend の message id（後から追跡するため必ず保存）
  unsub_token text not null unique,             -- 配信停止URLのトークン
  template_key text,
  email_source text,                            -- site / directory / places / manual（3条1項3号の根拠）
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  replied_at timestamptz,
  error text,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_out_messages_company on out_messages(company_id, created_at desc);
create index if not exists idx_out_messages_status on out_messages(company_id, status);
create index if not exists idx_out_messages_provider on out_messages(provider_id);
-- 同じ営業先へ2通目を送らない（フォローアップを足すときは、この制約を外すのではなく seq 列を足すこと）
create unique index if not exists uq_out_messages_prospect on out_messages(company_id, prospect_id)
  where prospect_id is not null and status <> 'canceled';
comment on table out_messages is '営業メールの送信ログ。1営業先1通（部分ユニーク索引で構造的に担保）（@yozan/outreach）';

-- ============================================================
-- 4) 抑止リスト — ここに入っているアドレス/ドメインへは何があっても送らない
-- ============================================================
create table if not exists out_suppressions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  email text,                                   -- 正規化済み（小文字）
  domain text,                                  -- ドメイン単位の抑止（法人まるごと）
  reason text not null,                         -- unsubscribed / bounced / complained / no_solicit / manual
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_out_suppressions_email on out_suppressions(company_id, email) where email is not null;
create unique index if not exists uq_out_suppressions_domain on out_suppressions(company_id, domain) where domain is not null;
comment on table out_suppressions is '送信禁止リスト。配信停止・バウンス・苦情・営業お断り表示を一元化（@yozan/outreach）';

-- ============================================================
-- 5) dms_prospects の拡張 — アドレスの出どころを残す
-- ============================================================
alter table dms_prospects
  add column if not exists email_source text,       -- site / directory / places / manual
  add column if not exists email_found_at timestamptz,
  add column if not exists email_page_url text;     -- 公表を確認したページ（3条1項3号の証跡）

comment on column dms_prospects.email_source is
  'メールアドレスをどこで見つけたか。site=先方サイトに公表＝特定電子メール法3条1項3号の根拠になる（@yozan/outreach）';

alter table out_settings     enable row level security;
alter table out_templates    enable row level security;
alter table out_messages     enable row level security;
alter table out_suppressions enable row level security;
-- ポリシーは作らない＝service_role のみ（アプリ層で認可 #3 / #65）
