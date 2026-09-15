-- ============================================================
-- 0182: AIカルテナレッジ「オンラインレッスン・モード」（RaRa LESSON / 小川うらら）
--
-- 背景（2026-09-15 ユーザー依頼）:
--   小川さんは公式LINE（RaRaLESSON 会員様専用）でオンラインレッスンをしている。
--   運用は「会員のメッセージを貼る → 返信文を作る → 直してLINEに貼る」。
--   小川さんのアカウントだけ、この運用に特化した画面に作り替える。
--
-- 設計:
--   - テナント単位で画面を切り替える: sc_settings.mode = 'online'
--     （既存テナントは 'coaching' のまま＝何も変わらない）
--   - 会員（sc_online_members）とトーク履歴（sc_online_messages）を持つ。
--     履歴は LINE 公式アカウントの「トーク履歴CSV」をそのまま取り込める。
--     同じCSVを何度入れても二重にならない（fingerprint の一意索引）。
--   - 返信文はAIの下書き → 本人が直す → コピー。**送信はしない**（LINEに貼るのは本人）。
--     下書きと確定文の両方を sc_online_replies に残す＝どこを直したかが後から分かる。
--   - 動画ライブラリ（sc_online_videos）は過去の返信に貼ったYouTubeから作る。
--   - 定型文（sc_online_templates）は本人が自由に書き換えられる。
--
-- 追加のみ。RLSはテナント標準（app.current_company_id()）。サーバーは service_role で company_id を必ず絞る。
-- ============================================================

-- ============ 0. テナントの画面モード ============
alter table sc_settings add column if not exists mode text not null default 'coaching';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sc_settings_mode_check') then
    alter table sc_settings add constraint sc_settings_mode_check check (mode in ('coaching','online'));
  end if;
end $$;
-- 返信の口調・署名・プラン別ルールなど（本人が設定画面で書き換える）
alter table sc_settings add column if not exists online_profile jsonb;

-- ============ 1. 会員 ============
create table if not exists sc_online_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,                       -- 表示名（例: 辻子 曜）
  name_key text not null,                   -- 照合用（空白・記号・プラン表記を除いた名前）
  line_name text,                           -- LINE上の表示名（例: ☆辻子　曜(レギュラー)）
  plan text not null default 'regular' check (plan in ('regular','premium','other')),
  mark text,                                -- 名前の頭の印（☆ / ⚠️ など。本人の運用メモ）
  status text not null default 'active' check (status in ('active','paused','left')),
  started_on date,
  goal text,                                -- 目標（例: 100切り）
  profile text,                             -- 身長・使用番手・練習環境など
  focus jsonb not null default '[]'::jsonb, -- いまの課題 [{text, since}]
  memo text,
  last_in_at timestamptz,                   -- 会員から最後に届いた時刻
  last_out_at timestamptz,                  -- 最後に返信した時刻
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_sc_online_members_key
  on sc_online_members (company_id, name_key) where deleted_at is null;
create index if not exists idx_sc_online_members_company
  on sc_online_members (company_id, last_in_at desc) where deleted_at is null;

-- ============ 2. トーク履歴 ============
create table if not exists sc_online_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  member_id uuid not null references sc_online_members(id) on delete cascade,
  direction text not null check (direction in ('in','out','system')),
  kind text not null default 'text' check (kind in ('text','video','photo','sticker','unsent','system')),
  sender text,
  body text not null default '',
  sent_at timestamptz not null,
  source text not null default 'csv' check (source in ('csv','paste','app')),
  fingerprint text not null,                -- 二重取込ふせぎ（同じ行は同じ値になる）
  created_at timestamptz not null default now()
);
create unique index if not exists uq_sc_online_messages_fp
  on sc_online_messages (member_id, fingerprint);
create index if not exists idx_sc_online_messages_member
  on sc_online_messages (member_id, sent_at desc);
create index if not exists idx_sc_online_messages_company_out
  on sc_online_messages (company_id, sent_at desc) where direction = 'out' and kind = 'text';

-- ============ 3. 返信の下書きと確定 ============
create table if not exists sc_online_replies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  member_id uuid references sc_online_members(id) on delete cascade,
  incoming text,                            -- 貼り付けた会員のメッセージ
  memo text,                                -- 動画を見て気づいたこと（本人のメモ）
  options jsonb,                            -- トーン・長さなど
  ai_draft text,                            -- AIが出した下書き（そのまま残す）
  final_body text,                          -- 本人が直してコピーした文
  status text not null default 'draft' check (status in ('draft','sent','discarded')),
  message_id uuid references sc_online_messages(id) on delete set null,
  created_by uuid references staff(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sc_online_replies_member
  on sc_online_replies (company_id, member_id, created_at desc);

-- ============ 4. 動画ライブラリ ============
create table if not exists sc_online_videos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  url text not null,
  title text not null,
  tags text[] not null default '{}',
  note text,
  use_count int not null default 0,
  last_used_at timestamptz,
  source text not null default 'manual' check (source in ('history','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- 部分索引にしない（PostgRESTのupsertは部分索引を推論できない＝night-os 0155と同じ罠）。
-- 消した動画をもう一度足したときは deleted_at を戻す。
create unique index if not exists uq_sc_online_videos_url
  on sc_online_videos (company_id, url);

-- ============ 5. 定型文 ============
create table if not exists sc_online_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  title text not null,
  body text not null,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sc_online_templates_company
  on sc_online_templates (company_id, sort_order) where deleted_at is null;

-- ============ updated_at / RLS ============
do $$
declare t text;
begin
  foreach t in array array['sc_online_members','sc_online_replies','sc_online_videos','sc_online_templates'] loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
  end loop;
  foreach t in array array['sc_online_members','sc_online_messages','sc_online_replies','sc_online_videos','sc_online_templates'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = (select app.current_company_id()))', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = (select app.current_company_id()))', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = (select app.current_company_id()))', t);
  end loop;
end $$;
