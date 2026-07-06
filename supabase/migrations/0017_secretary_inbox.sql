-- 0017_secretary_inbox.sql
-- CEO AI 秘書: 問い合わせ受信箱（Secretary Inbox）
-- メール等から検知した問い合わせを分類・返信案・カレンダー案とともにキュー化し、
-- Cockpitで古川さんが「確認・承認」できるようにする（VISION §1/§7）。
-- 送信・カレンダー登録の実行はエンジン（定期タスク or 将来のOAuth連携）が担い、
-- 本テーブルは「見る・判断・承認」の状態を持つ。
-- 返信の外部送信は承認必須（status=approved を経てから送信）。カレンダー登録は自動方針。

create table sec_inquiries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),

  -- 発生源と重複排除
  source        text not null default 'gmail',   -- gmail / form / manual
  external_id   text,                             -- Gmail thread/message id 等（重複防止）

  -- 分類（YOZANの想定: システム作成依頼 / アパレル商品問い合わせ / 業者間取引 / その他 / ノイズ）
  inquiry_type  text not null default 'other',    -- system_request / apparel / b2b / other / noise
  priority      text not null default 'normal',   -- high / normal / low

  -- 差出人・内容
  from_name     text,
  from_email    text,
  subject       text,
  snippet       text,                             -- 本文抜粋（個人情報は最小限）
  received_at   timestamptz,

  -- AI生成
  ai_summary    text,                             -- 「○○様より○○の件でお問い合わせ」
  ai_draft_reply text,                            -- 返信案（承認後に送信）
  proposed_event jsonb,                           -- {title,start,end,location,notes} or null

  -- 実行状態
  status        text not null default 'new',      -- new / awaiting_approval / approved / replied / scheduled / dismissed
  handled_by_agent text not null default 'customer_ai',
  gmail_thread_id text,
  gmail_draft_id  text,
  calendar_event_id text,

  -- 判断記録
  decided_by    uuid references staff(id),
  decided_at    timestamptz,
  reply_sent_at timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index idx_sec_inquiries_company_status on sec_inquiries (company_id, status, received_at desc);
create unique index uq_sec_inquiries_external on sec_inquiries (company_id, source, external_id)
  where external_id is not null and deleted_at is null;

create trigger set_updated_at before update on sec_inquiries
  for each row execute function app.set_updated_at();

-- RLS（標準テナント分離パターン: company_id = app.current_company_id()）
alter table sec_inquiries enable row level security;

create policy sec_inquiries_select on sec_inquiries
  for select using (company_id = app.current_company_id());
create policy sec_inquiries_insert on sec_inquiries
  for insert with check (company_id = app.current_company_id());
create policy sec_inquiries_update on sec_inquiries
  for update using (company_id = app.current_company_id());
