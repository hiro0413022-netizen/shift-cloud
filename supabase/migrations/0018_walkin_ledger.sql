-- 0018_walkin_ledger.sql
-- 一時利用者名簿（member-os / GOLF WING宝塚）— DECISIONS #28、設計: docs/modules/member-os/WALKIN_LEDGER.md
-- 予約起点をやめ、店頭常設タブレットの予約なし自己入力＋スタッフ追記で紙/手入力Excelを廃止。
-- 既存0011の mbr_guests を再利用し、来店1件=1行の台帳 mbr_walkin_visits を追加。
-- 既存標準準拠(#11/#17): company_id + RLSテナント分離 / 論理削除 / updated_atトリガー。書き込みはservice_role+トークン/requireActor。

-- ============================================================
-- 1. mbr_guests に不足列を追加（職業 / 連絡方法 / 店までの距離）
-- ============================================================
alter table mbr_guests add column if not exists occupation text;        -- 職業
alter table mbr_guests add column if not exists contact_method text;     -- 連絡方法(電話/SMS/LINE/メール)
alter table mbr_guests add column if not exists distance_km numeric;     -- お店までの距離(km)

-- ============================================================
-- 2. mbr_walkin_visits — 一時利用の来店1件=1行（台帳本体）
-- ============================================================
create table mbr_walkin_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  guest_id uuid references mbr_guests(id),           -- 顧客（自己入力で作成/更新）
  visit_seq bigint generated always as identity,     -- 台帳の連番
  visited_on date not null default current_date,     -- 日付(A)
  visit_type text not null default 'trial'           -- 利用区分(B)
    check (visit_type in ('trial', 'fitting', 'bay', 'visitor_bay', 'other')),
  fee integer,                                        -- 利用料(N)
  discount text,                                      -- 割引(O)
  payment_method text                                 -- 支払い方法(Q)
    check (payment_method is null or payment_method in ('store', 'web', 'free_campaign', 'other')),
  pro_staff text,                                     -- 担当プロ(R) ※staff外のプロもあるためtext
  reception_staff_id uuid references staff(id),       -- 担当受付(S)
  result text not null default 'none'                 -- 成約(T): 入会/購入/なし
    check (result in ('join', 'purchase', 'none')),
  repeat_date date,                                   -- 再来の場合日付(P)
  reapproach_date date,                               -- 再アプローチ日(U)
  referral_source text,                               -- 何で知ったか(W)
  referral_source_other text,                         -- 何で知ったか その他(X)
  survey jsonb not null default '{}',                 -- 体験理由/フィッティング理由/通う目的/入会興味/フォロー状況(Y〜AQ)
  note text,                                          -- 備考(V)
  consent_at timestamptz,                             -- 個人情報同意
  signature text,                                     -- 電子サイン(dataURL等)
  is_migrated boolean not null default false,         -- 現行Excelからの移行行フラグ(Phase D)
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_mbr_walkin_company_date on mbr_walkin_visits (company_id, visited_on) where deleted_at is null;
create index idx_mbr_walkin_type on mbr_walkin_visits (company_id, visit_type) where deleted_at is null;

-- ============================================================
-- 3. mbr_walkin_tokens — 店頭常設タブレットの受付URL用トークン（店舗単位・長期有効、sha256）
--    予約起点なし: スタッフが店舗ごとに一度発行しQR掲示。お客様は予約なしで自己入力できる。
-- ============================================================
create table mbr_walkin_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  token_hash text not null,                           -- sha256(token)。生トークンは発行時のみ表示
  label text,                                         -- 用途ラベル(例: 宝塚 受付タブレット)
  active boolean not null default true,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create unique index idx_mbr_walkin_token_hash on mbr_walkin_tokens (token_hash);

-- ============================================================
-- 4. トリガー + RLS（0011と同方式）
-- ============================================================
create trigger set_updated_at before update on mbr_walkin_visits
  for each row execute function app.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['mbr_walkin_visits', 'mbr_walkin_tokens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- ============================================================
-- 5. refresh_member_kpis 拡張: 体験→入会率・フィッティング→購入率を一時利用台帳から集計
--    体験予約受付が予約(mbr_trial_bookings)から一時利用台帳(mbr_walkin_visits)へ移行したため、
--    trial_bookings(体験利用者数) / conversion_rate(体験→入会率) を walkin から算出。
--    台帳が空の間は既存(mbr_trial_bookings)にフォールバックして後方互換。
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
  v_use_walkin boolean;
begin
  v_use_walkin := exists (select 1 from mbr_walkin_visits where company_id = p_company_id and deleted_at is null);

  if v_use_walkin then
    -- 一時利用台帳: 体験(trial)件数 と 体験→入会率(result=join / trial件数)
    with monthly as (
      select date_trunc('month', visited_on)::date as m,
             count(*) filter (where visit_type = 'trial') as trials,
             count(*) filter (where visit_type = 'trial' and result = 'join') as joined
      from mbr_walkin_visits
      where company_id = p_company_id and deleted_at is null
      group by 1 order by 1 desc limit 12
    )
    select
      coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value', trials) order by m), '[]'::jsonb),
      coalesce((select trials from monthly where m = v_month_start), 0),
      coalesce(jsonb_agg(jsonb_build_object('date', m::text, 'value',
               case when trials > 0 then round(joined::numeric / trials * 100, 1) else 0 end) order by m), '[]'::jsonb),
      (select case when trials > 0 then round(joined::numeric / trials * 100, 1) else null end
         from monthly where m = v_month_start)
    into v_trial_trend, v_trial_current, v_conv_trend, v_conv_current
    from monthly;

    update kpis set current_value = v_trial_current, trend = v_trial_trend,
      notes = '一時利用者名簿（mbr_walkin_visits・体験利用件数）から自動集計',
      updated_at = now(), deleted_at = null
    where company_id = p_company_id and code = 'trial_bookings';

    update kpis set current_value = v_conv_current, trend = v_conv_trend,
      notes = '一時利用者名簿（体験→入会数÷体験件数）から自動集計',
      updated_at = now(), deleted_at = null
    where company_id = p_company_id and code = 'conversion_rate';
    return;
  end if;

  -- フォールバック（旧: 体験予約 mbr_trial_bookings）
  if not exists (select 1 from mbr_trial_bookings where company_id = p_company_id and deleted_at is null) then
    return;
  end if;
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

  update kpis set current_value = v_trial_current, trend = v_trial_trend, updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'trial_bookings';
  update kpis set current_value = v_conv_current, trend = v_conv_trend, updated_at = now(), deleted_at = null
  where company_id = p_company_id and code = 'conversion_rate';
end $$;

grant execute on function refresh_member_kpis(uuid) to authenticated;
