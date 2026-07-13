-- 0045: CEO Inbox 受信フィルタ / 改善提案 / 実行指示（DECISIONS #51）
-- 背景（2026-07-14 診断）:
--   1) LINEリッチメニュー押下（「プロの出勤情報」等）が sec_inquiries に message イベントとして入り、
--      「未対応の問い合わせ」を占拠していた（15件中10件）。→ 受信フィルタで自動的に対応不要へ。
--   2) 改善提案（ai_suggestions）は器だけ有り0件＝機能していなかった。→ 日次で生成し常時表示。
--   3) 「実行指示」を出す先（スタッフ/AI社員/外部送信承認）が分散していて履歴が残らなかった。
--      → gn_directives を指示台帳（正典）とし、実体は sp_tasks / prompts / approval_requests に配る。

-- ============================================================
-- 1. 受信フィルタ（リッチメニュー等を「対応要件」から外す）
-- ============================================================
create table if not exists sec_filter_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  source text not null default 'line' check (source in ('line', 'gmail', 'any')),
  pattern text not null,
  match_type text not null default 'exact' check (match_type in ('exact', 'contains', 'prefix')),
  label text,                       -- 表示用の分類名（例: リッチメニュー）
  action text not null default 'noise' check (action in ('noise', 'low')), -- noise=対応不要 / low=優先度を下げるだけ
  active boolean not null default true,
  hits integer not null default 0,  -- このルールで除外した件数（効いているかの可視化）
  last_hit_at timestamptz,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sec_filter_rules_company on sec_filter_rules (company_id) where deleted_at is null;

alter table sec_inquiries add column if not exists filtered_by_rule uuid references sec_filter_rules(id);
alter table sec_inquiries add column if not exists draft_generated_at timestamptz;
alter table sec_inquiries add column if not exists reply_error text;

-- 既定ルール（実データから検出したリッチメニュー文言。以後は /inbox 画面から追加・削除できる）
insert into sec_filter_rules (company_id, source, pattern, match_type, label, action)
select c.id, 'line', v.pattern, 'exact', 'リッチメニュー', 'noise'
from companies c
cross join (values ('プロの出勤情報'), ('第10回親睦コンペ')) as v(pattern)
where c.deleted_at is null
  and not exists (
    select 1 from sec_filter_rules r
    where r.company_id = c.id and r.pattern = v.pattern and r.deleted_at is null
  );

-- 既存の滞留分にルールを遡って適用（対応不要へ）
update sec_inquiries q
set status = 'dismissed',
    inquiry_type = 'noise',
    filtered_by_rule = r.id,
    updated_at = now()
from sec_filter_rules r
where r.company_id = q.company_id
  and r.deleted_at is null
  and r.active
  and r.action = 'noise'
  and q.source = 'line'
  and q.deleted_at is null
  and q.status in ('new', 'awaiting_approval')
  and btrim(coalesce(q.snippet, '')) = r.pattern;

-- ============================================================
-- 2. 改善提案（ai_suggestions を実際に使う。重複生成の防止キーを追加）
-- ============================================================
alter table ai_suggestions add column if not exists dedupe_key text;
alter table ai_suggestions add column if not exists impact text;      -- 効果の見立て（例: 体験予約+5件/月）
alter table ai_suggestions add column if not exists effort text;      -- 手間（すぐ/1日/継続）
alter table ai_suggestions add column if not exists href text;        -- 関連画面へのリンク
alter table ai_suggestions add column if not exists dismissed_at timestamptz;
create unique index if not exists uq_ai_suggestions_dedupe
  on ai_suggestions (company_id, dedupe_key)
  where dedupe_key is not null and dismissed_at is null;

-- ============================================================
-- 3. 実行指示台帳（Genesisから指示を出す）
-- ============================================================
create table if not exists gn_directives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  target_kind text not null check (target_kind in ('staff', 'ai_agent', 'external')),
  staff_id uuid references staff(id),          -- target_kind=staff
  agent_id uuid references ai_agents(id),      -- target_kind=ai_agent
  title text not null,
  body text,
  due_date date,
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  status text not null default 'issued' check (status in ('issued', 'in_progress', 'done', 'cancelled')),
  origin_kind text,                            -- suggestion / inquiry / judgment / manual
  origin_id uuid,
  sp_task_id uuid references sp_tasks(id),     -- スタッフ指示の実体
  prompt_id uuid references prompts(id),       -- AI社員指示の実体
  approval_request_id uuid references approval_requests(id), -- 外部送信の承認
  result text,
  created_by uuid references staff(id),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_gn_directives_open
  on gn_directives (company_id, status) where deleted_at is null;

alter table sec_filter_rules enable row level security;
alter table gn_directives enable row level security;
-- アプリはservice_role経由（既存アプリ規約と同じ）。RLSは既定deny。
