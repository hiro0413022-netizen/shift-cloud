-- 0034_mon_receipts.sql — Money OS 経理証憑（請求書・見積・領収書・レシート）
-- 設計: docs/modules/money-os/SYSTEM.md / DECISIONS #29a・#41
-- 方針: 金額突合（mon_expense / mon_bank_txn と1:1リンク）＋電子帳簿保存法の保管。
--       法務系（契約書）は Legal OS（leg_*）。契約↔請求は leg_document_id 1本でリンク（#29a）。
--       既存テーブル変更なし・追加のみ（#38）。RLSは既存標準のテナント分離。

-- ============================================================
-- 1. mon_receipts — 証憑本体
-- ============================================================
create table mon_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  segment_id uuid references fin_segments(id),             -- null = 未分類/全社
  kind text not null default 'receipt'
    check (kind in ('invoice','quote','receipt','delivery','other')), -- 請求書/見積/領収書・レシート/納品書/他
  issue_date date,                                         -- 発行日（レシートの日付）
  counterparty text,                                       -- 発行元（店名・会社名）
  amount numeric,                                          -- 税込金額（円）
  memo text,
  status text not null default 'unmatched'
    check (status in ('unmatched','matched','archived')),  -- 突合状態
  mon_expense_id uuid references mon_expense(id),          -- 経費行との突合（1:1想定）
  mon_bank_txn_id uuid references mon_bank_txn(id),        -- 口座/カード明細との突合
  leg_document_id uuid references leg_documents(id),       -- 契約↔請求リンク（顧問料等 #29a）
  storage_path text not null,                              -- mon-receipts/{company}/{yyyy}/{uuid}_{filename}
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  ocr_text text,                                           -- 経理AIのOCR結果（後続フェーズ）
  source text not null default 'app',                      -- app / api
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_mon_receipts_date on mon_receipts (company_id, issue_date);
create index idx_mon_receipts_status on mon_receipts (company_id, status);
create index idx_mon_receipts_expense on mon_receipts (company_id, mon_expense_id);

-- ============================================================
-- 2. トリガ＋RLS（既存標準: テナント分離）
-- ============================================================
create trigger set_updated_at before update on mon_receipts
  for each row execute function app.set_updated_at();
alter table mon_receipts enable row level security;
create policy tenant_select on mon_receipts for select to authenticated
  using (company_id = app.current_company_id());
create policy tenant_insert on mon_receipts for insert to authenticated
  with check (company_id = app.current_company_id());
create policy tenant_update on mon_receipts for update to authenticated
  using (company_id = app.current_company_id());

-- ============================================================
-- 3. Storage: プライベートバケット mon-receipts（legal-docsと同方式）
-- ============================================================
insert into storage.buckets (id, name, public)
values ('mon-receipts', 'mon-receipts', false)
on conflict (id) do nothing;

create policy mon_receipts_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'mon-receipts' and (storage.foldername(name))[1] = app.current_company_id()::text);
create policy mon_receipts_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'mon-receipts' and (storage.foldername(name))[1] = app.current_company_id()::text);
create policy mon_receipts_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'mon-receipts' and (storage.foldername(name))[1] = app.current_company_id()::text);
create policy mon_receipts_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'mon-receipts' and (storage.foldername(name))[1] = app.current_company_id()::text);
