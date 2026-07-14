-- 0024_legal_os.sql
-- Legal OS フェーズ1: 契約書・覚書・規約・NDAの保管と期限管理
-- 設計: docs/modules/legal-os/SYSTEM.md
-- 方針: 独立アプリ(apps/legal-os)から書込 → 共有DB。GENESIS本体は閲覧・承認のみ。
--       全社横断のため segment_id は任意(null=全社)。担当AI=legal_ai(登録済)。
--       既存テーブル変更なし。RLSは既存標準のテナント分離(app.current_company_id())。

-- ============================================================
-- 1. leg_grants — ユーザー×役割×事業(任意)。段別権限はアプリ層で参照
-- ============================================================
create table leg_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  user_id uuid not null,                                   -- auth.users.id
  role text not null check (role in ('uploader', 'manager', 'viewer')),
  segment_id uuid references fin_segments(id),             -- null = 全社
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique nulls not distinct (company_id, user_id, segment_id)
);
create index idx_leg_grants_user on leg_grants (company_id, user_id);

-- ============================================================
-- 2. leg_documents — 契約・書類 本体
-- ============================================================
create table leg_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  segment_id uuid references fin_segments(id),             -- null = 全社契約
  doc_type text not null check (doc_type in ('contract','agreement','terms','nda','other')),
  title text not null,
  counterparty text,                                       -- 相手方名（マスタ化は後回し）
  status text not null default 'draft'
    check (status in ('draft','under_review','pending_approval','active','expired','terminated','archived')),
  effective_date date,                                     -- 契約開始日
  expiry_date date,                                        -- 契約満了日
  auto_renew boolean not null default false,               -- 自動更新の有無
  renewal_notice_days integer,                             -- 解約通知の必要日数（例:90）
  next_action_date date,                                   -- 解約判断すべき期日 = expiry_date - renewal_notice_days
  amount numeric,                                          -- 契約金額（任意）
  currency text not null default 'JPY',
  risk_level text check (risk_level in ('low','medium','high')),  -- legal_ai提案→人確定
  summary text,                                            -- 要点（legal_ai抽出→人編集可）
  detail jsonb not null default '{}'::jsonb,               -- 更新条件文/特約/管轄 等
  created_by text,
  approved_by text,
  source text not null default 'app',                      -- app / api / migration
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_leg_documents_status on leg_documents (company_id, status);
create index idx_leg_documents_next_action on leg_documents (company_id, next_action_date);
create index idx_leg_documents_expiry on leg_documents (company_id, expiry_date);

-- ============================================================
-- 3. leg_files — 証憑ファイル（1契約に複数版・付属書類）
-- ============================================================
create table leg_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  document_id uuid not null references leg_documents(id),
  storage_path text not null,                              -- legal-docs/{company}/{document}/{filename}
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  kind text not null default 'original'
    check (kind in ('original','signed','amendment','attachment')),
  ocr_text text,                                           -- legal_aiの入力・全文検索用
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_leg_files_document on leg_files (company_id, document_id);

-- ============================================================
-- 4. leg_reminders — 期限アラート（複数期日を持つため専用）
-- ============================================================
create table leg_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  document_id uuid not null references leg_documents(id),
  kind text not null check (kind in ('renewal','termination_notice','expiry','custom')),
  due_date date not null,
  lead_days integer not null default 30,                   -- 何日前に通知するか
  status text not null default 'scheduled'
    check (status in ('scheduled','notified','done','dismissed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_leg_reminders_due on leg_reminders (company_id, status, due_date);
create index idx_leg_reminders_document on leg_reminders (company_id, document_id);

-- ============================================================
-- 5. トリガ＋RLS（既存標準: テナント分離）
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['leg_grants','leg_documents','leg_files','leg_reminders'] loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- ============================================================
-- 6. Storage: プライベートバケット legal-docs
--    実体はStorage、閲覧は署名付きURL(サーバ側で発行)。
--    直アクセスは同一company配下(パス先頭=company_id)のみ許可。
-- ============================================================
insert into storage.buckets (id, name, public)
values ('legal-docs', 'legal-docs', false)
on conflict (id) do nothing;

create policy leg_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'legal-docs' and (storage.foldername(name))[1] = app.current_company_id()::text);
create policy leg_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'legal-docs' and (storage.foldername(name))[1] = app.current_company_id()::text);
create policy leg_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'legal-docs' and (storage.foldername(name))[1] = app.current_company_id()::text);
create policy leg_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'legal-docs' and (storage.foldername(name))[1] = app.current_company_id()::text);

-- ============================================================
-- 7. シード（モジュール登録）
-- ============================================================
do $$
declare v_company uuid;
begin
  select id into v_company from companies limit 1;

  -- モジュール（設計中。実装完了でliveに更新）
  insert into modules (company_id, code, name, description, status, sort_order)
  values (v_company, 'legal', '法務・契約管理（Legal OS）',
          '契約書・覚書・規約・NDAの保管と期限管理。独立アプリ、legal_aiがリスク/期限を提案、締結は要承認', 'designing', 36)
  on conflict (company_id, code) do update set description = excluded.description;
end $$;
