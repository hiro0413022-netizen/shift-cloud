-- 0011_member_trial.sql
-- 会員/体験予約受付モジュール（member-os 第1弾: 体験受付の入口）
-- DECISIONS #22/#23: GOLF WINGの紙+Excel運用を置き換え、体験予約〜入会をGenesisで受け付ける。
--   お客様=タブレット自己入力（トークン方式 #12）、スタッフ=Web入力。KPI(体験予約数/入会率)を自動集計。
-- 設計: docs/modules/member-os/TRIAL_INTAKE.md
-- 既存標準準拠(DECISIONS #11/#16/#17): company_id + RLSテナント分離 / 論理削除 / updated_atトリガー。
--   顧客向けタブレット書き込みは service_role(admin) 経由でトークン検証（RLSは authenticated 用のまま）。

-- ============================================================
-- 1. mbr_guests — 見込み客/顧客（個人情報。将来の会員名簿の基盤にもなる）
-- ============================================================
create table mbr_guests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),            -- 主に来店した店舗
  name text not null,
  name_kana text,
  gender text check (gender in ('male', 'female', 'other', 'unknown')),
  birth_date date,
  postal_code text,
  prefecture text,
  address1 text,                                   -- 市区町村丁目番地号
  building text,
  phone text,
  mobile text,
  email text,
  dm_ok boolean not null default true,             -- DM・連絡可否
  referrer text,                                   -- 紹介者名など
  survey jsonb not null default '{}',              -- アンケート(ゴルフ経験/きっかけ/目的/課題)
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_mbr_guests_company on mbr_guests (company_id) where deleted_at is null;
create index idx_mbr_guests_name_kana on mbr_guests (company_id, name_kana);

-- ============================================================
-- 2. mbr_trial_bookings — 体験予約（1予約=1行）
-- ============================================================
create table mbr_trial_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  booking_seq bigint generated always as identity, -- 人が読む予約番号の元
  guest_id uuid references mbr_guests(id),         -- 自己入力前はnull可（予約枠だけ先行作成）
  program text,                                    -- 体験メニュー
  desired_at timestamptz,                          -- 希望日時（未確定枠）
  lesson_date date,                               -- 確定日
  start_time time,
  end_time time,
  bay text,                                        -- 打席/実施場所
  staff_id uuid references staff(id),              -- 担当スタッフ
  source text not null default 'walkin'
    check (source in ('hp', 'phone', 'walkin', 'referral', 'sns', 'other')),
  status text not null default 'reserved'
    check (status in ('reserved', 'visited', 'canceled', 'no_show')),
  result_memo text,                               -- 体験結果メモ
  joined boolean not null default false,           -- 入会したか
  joined_at date,
  decline_reason text,                            -- 見送り理由（フォロー用）
  consent_at timestamptz,                         -- 個人情報取扱い同意日時
  signature text,                                 -- 電子サイン(dataURL 等)
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_mbr_bookings_company_date on mbr_trial_bookings (company_id, lesson_date) where deleted_at is null;
create index idx_mbr_bookings_status on mbr_trial_bookings (company_id, status);

-- ============================================================
-- 3. mbr_intake_tokens — タブレット自己入力トークン（sha256、DECISIONS #12方式）
-- ============================================================
create table mbr_intake_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  booking_id uuid not null references mbr_trial_bookings(id),
  token_hash text not null,                        -- sha256(token)。生トークンは発行時のみ表示
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index idx_mbr_intake_token_hash on mbr_intake_tokens (token_hash);

-- ============================================================
-- 4. トリガー＋RLS（既存標準の流用）
-- ============================================================
do $$
declare
  t text;
begin
  -- updated_atトリガー: updated_at列を持つ表のみ
  foreach t in array array['mbr_guests', 'mbr_trial_bookings'] loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
  end loop;
  -- RLSテナント分離: 全表
  foreach t in array array['mbr_guests', 'mbr_trial_bookings', 'mbr_intake_tokens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- ============================================================
-- 5. KPI自動集計: refresh_member_kpis（体験予約数 / 入会率）
--    0010で器を用意済(code: trial_bookings / conversion_rate)。手動更新→自動集計へ。
--    退会率(churn_rate)・会員数(members)は会員名簿移管後に対応（当面手動）。
-- ============================================================
create or replace function refresh_member_kpis(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
  v_trial_trend jsonb;
  v_trial_current numeric;
  v_conv_trend jsonb;
  v_conv_current numeric;
begin
  if not exists (select 1 from mbr_trial_bookings where company_id = p_company_id and deleted_at is null) then
    return;
  end if;

  -- 月次: 体験予約数(キャンセル除く) と 入会率(入会数/来店数)
  with monthly as (
    select date_trunc('month', coalesce(lesson_date, created_at::date))::date as m,
           count(*) filter (where status <> 'canceled') as trials,
           count(*) filter (where status = 'visited') as visited,
           count(*) filter (where joined) as joined
    from mbr_trial_bookings
    where company_id = p_company_id and deleted_at is null
    group by 1 order by 1 desc limit 12
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', trials) order by m), '[]'::jsonb),
    coalesce((select trials from monthly where m = v_month_start), 0),
    coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value',
             case when visited > 0 then round(joined::numeric / visited * 100, 1) else 0 end) order by m), '[]'::jsonb),
    (select case when visited > 0 then round(joined::numeric / visited * 100, 1) else null end
       from monthly where m = v_month_start)
  into v_trial_trend, v_trial_current, v_conv_trend, v_conv_current
  from monthly;

  update kpis set
    current_value = v_trial_current,
    trend = v_trial_trend,
    notes = '体験予約受付モジュール（mbr_trial_bookings）から自動集計',
    updated_at = now(),
    deleted_at = null
  where company_id = p_company_id and code = 'trial_bookings';

  update kpis set
    current_value = v_conv_current,
    trend = v_conv_trend,
    notes = '体験予約受付モジュール（入会数÷来店数）から自動集計',
    updated_at = now(),
    deleted_at = null
  where company_id = p_company_id and code = 'conversion_rate';
end $$;

grant execute on function refresh_member_kpis(uuid) to authenticated;
