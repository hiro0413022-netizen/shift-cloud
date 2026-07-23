-- 0070_swing_cortex_students.sql
-- SWING CORTEX P3 — 生徒コンテキスト（コーチのCRM化 / docs/modules/swing-cortex/SYSTEM.md）
--
-- 目的: 診断・コメントを「生徒」に紐づけて蓄積し、次回は前回の課題を踏まえて提案する。
--   (1) sc_students … 軽量生徒台帳（member_codeで将来 lesson-os lsn_students と突合。FKで縛らない疎結合）
--   (2) sc_notes    … 生徒別の保存コメント（＝SWING CORTEX内のカルテ。整形版/自然文版を保持）
-- lesson-os への全面統合（lsn_comments 直書き）は P4。まずは sc_ 内で自己完結。
-- 追加のみ（DECISIONS #2）。RLSはテナント標準（app.current_company_id()）。service_roleバイパス。

-- ============ 1. 生徒台帳 ============
create table if not exists sc_students (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  name_kana text,
  member_code text,                 -- Smart Hello会員番号等（lesson-os/会員名簿との将来突合キー）
  memo text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sc_students_company on sc_students (company_id, status, name) where deleted_at is null;

-- ============ 2. 生徒別カルテ（保存コメント） ============
create table if not exists sc_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  student_id uuid not null references sc_students(id) on delete cascade,
  symptom_id uuid references sc_symptoms(id),
  symptom_name text,                -- 表示用スナップショット
  coach_memo text,                  -- コーチの所見（入力）
  structured text,                  -- 整形した指導記録
  natural_text text,                -- 自然な文章コメント（"natural"はPG予約語のため _text 付き）
  coach_staff_id uuid references staff(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_sc_notes_student on sc_notes (student_id, created_at desc);
create index if not exists idx_sc_notes_company on sc_notes (company_id, created_at desc);

-- ============ 診断ログに生徒リンク列を追加（任意） ============
alter table sc_diagnoses add column if not exists student_id uuid references sc_students(id);
create index if not exists idx_sc_diagnoses_student on sc_diagnoses (student_id, created_at desc);

-- ============ updated_at トリガ ============
do $$
begin
  execute 'drop trigger if exists set_updated_at on sc_students';
  execute 'create trigger set_updated_at before update on sc_students for each row execute function app.set_updated_at()';
end $$;

-- ============ RLS（テナント標準） ============
alter table sc_students enable row level security;
alter table sc_notes    enable row level security;
do $$
declare t text;
begin
  foreach t in array array['sc_students','sc_notes'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;
