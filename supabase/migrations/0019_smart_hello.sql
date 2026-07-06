-- 0019_smart_hello.sql
-- Smart Hello（会員名簿/予約一覧）取込テーブル + 会員系KPI（DECISIONS #22、SMART_HELLO_IMPORT.md）
-- GOLF WING宝塚の会員は Smart Hello が正。CSV/ExcelエクスポートをGenesis/member-osに取込み、会員数/退会率をCEO AIへ。
-- 重要: 口座番号・クレジットカード番号・銀行情報は一切取り込まない（KPI・会員管理に不要／機微情報）。個人情報はRLS保護。

-- ============================================================
-- 1. mbr_members — 会員名簿スナップショット（全件洗い替え方式）
-- ============================================================
create table mbr_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  member_no text not null,                 -- 会員番号
  name text,
  name_kana text,
  gender text,
  birth_date date,
  age integer,
  join_date date,                          -- 入会日
  leave_date date,                         -- 退会日（未来日＝退会予定）
  leave_reason text,
  member_type text,                        -- 会員種類名
  class_name text,
  store_name text,
  campaign text,
  suspend_start text,                      -- 休会開始年月(YYYY/MM等の元表記)
  suspend_end text,
  payment_method text,                     -- 支払方法（名称のみ。口座/カード番号は保持しない）
  monthly_visits integer,
  last_visit_date date,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_mbr_members_company on mbr_members (company_id);
create unique index idx_mbr_members_no on mbr_members (company_id, member_no);

-- ============================================================
-- 2. mbr_reservations — 予約一覧（運用データ・非PII。予約番号でユニーク＝重複取込防止）
--    住所・電話・メール・生年月日等の個人情報は取り込まない（会員番号で会員名簿と紐付く）。
-- ============================================================
create table mbr_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  reservation_no text not null,            -- 予約番号
  store_name text,
  program_type text,                       -- プログラム種別名
  program text,
  place text,                              -- 実施場所名
  staff_name text,
  lesson_date date,
  start_time time,
  end_time time,
  reservation_kind text,                   -- 予約区分（予約/体験）
  member_no text,                          -- 予約者会員番号（会員以外は空）
  status text,                             -- 予約状態
  attendance text,                         -- 出欠
  amount integer,                          -- 税込金額
  reserved_at timestamptz,                 -- 予約登録日時
  canceled_at timestamptz,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_mbr_res_company_date on mbr_reservations (company_id, lesson_date);
create unique index idx_mbr_res_no on mbr_reservations (company_id, reservation_no);

-- ============================================================
-- 3. RLS（既存標準・authenticated select、書込はservice_role）
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['mbr_members', 'mbr_reservations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- ============================================================
-- 4. refresh_smart_hello_kpis — 会員数(在籍) と 退会率 を kpis へ
--    在籍 = スタッフ除く かつ (退会日なし または 退会日が未来=退会予定は在籍扱い)
--    当月退会 = 退会日の年月 = 当月。退会率 = 当月退会 ÷ 在籍。
-- ============================================================
create or replace function refresh_smart_hello_kpis(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
  v_left_this_month integer;
  v_churn numeric;
begin
  if not exists (select 1 from mbr_members where company_id = p_company_id) then
    return;
  end if;

  select count(*) into v_active
  from mbr_members
  where company_id = p_company_id
    and coalesce(member_type,'') <> 'スタッフ'
    and (leave_date is null or leave_date >= current_date);

  select count(*) into v_left_this_month
  from mbr_members
  where company_id = p_company_id
    and coalesce(member_type,'') <> 'スタッフ'
    and leave_date is not null
    and date_trunc('month', leave_date) = date_trunc('month', current_date);

  v_churn := case when v_active > 0 then round(v_left_this_month::numeric / v_active * 100, 1) else null end;

  update kpis set current_value = v_active, notes = 'Smart Hello会員名簿から自動集計（在籍・スタッフ除く）',
    updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'members';

  update kpis set current_value = v_churn, notes = 'Smart Hello会員名簿（当月退会÷在籍）から自動集計',
    updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'churn_rate';
end $$;

grant execute on function refresh_smart_hello_kpis(uuid) to authenticated;
