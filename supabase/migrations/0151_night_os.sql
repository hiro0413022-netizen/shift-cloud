-- 0151_night_os.sql — Night OS（ナイトビジネスの電子伝票＋給与計算）/ 2026-09-09
--
-- きっかけ（ユーザー指示 2026-09-09）:
--   「飲み屋はすごい複雑で、女の子がお客さんを連れてきたらその日は時給何%アップ、
--     指名をもらったら何円、シャンパンを卸してくれたら何%、みたいなことが絡み合っている。
--     毎月の締めが店長は大変。彼らを楽にしてあげたい」
--
-- ★ 締めが大変になる本当の原因は「後から誰の分か分からなくなること」
--   だから伝票の1行ごとに担当キャスト(cast_id)を持たせ、
--   担当が空の行が残っている伝票は **DB側で閉じられない**（trg_nite_slip_close_guard）。
--   月末に突き合わせる作業そのものを無くす。
--
-- ★ 明細は消さない
--   取り消しは status='void' にするだけで行は残す。誰がいつ何を消したかが後から追える。
--   （夜の店は入力も取り消しも多い。消えた伝票が説明できないのが一番まずい）
--
-- ★ バックの「ルール」と「確定金額」を分ける
--   計算の正典は @yozan/core/night-payroll（TS 1か所）。
--   DBには計算した結果(back_amount)と根拠(back_basis)を焼き付ける。
--   → あとで設定を変えても、確定済みの過去の給与は1円も動かない。
--
-- ★ 業態は設定で吸収する
--   キャバクラ / ガールズバー・ラウンジ でバック項目が違うので、
--   ルールは nite_rulesets.rules(jsonb) に版として持ち、店ごとに差し替える。

-- ============================================================
-- 1. ランクと時給
-- ============================================================
create table if not exists nite_cast_ranks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  name text not null,                              -- 例: レギュラー / A / S
  hourly_wage integer not null check (hourly_wage >= 0),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_nite_cast_ranks_name
  on nite_cast_ranks (store_id, name) where deleted_at is null;

-- ============================================================
-- 2. キャスト（女の子）
--   スタッフ(staff)ではない。ログインは携帯番号＋下4桁の想定（frunk_membersと同じ考え方）。
-- ============================================================
create table if not exists nite_casts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  name text not null,                              -- 本名（給与・支払い用）
  display_name text not null,                      -- 源氏名（画面・伝票に出る名前）
  kana text,
  phone text,                                      -- ログインID兼用（E164）
  rank_id uuid references nite_cast_ranks(id),
  hourly_wage_override integer,                    -- ランクと違う時給の人だけ入れる
  joined_on date,
  status text not null default 'active' check (status in ('active', 'leave', 'retired')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_nite_casts_store
  on nite_casts (store_id, status) where deleted_at is null;
create unique index if not exists uq_nite_casts_phone
  on nite_casts (phone) where phone is not null and deleted_at is null;

-- ============================================================
-- 3. バック設定（版で持つ）
--   rules(jsonb) の中身は @yozan/core/night-payroll の RuleSet 型が正典。
--   effective_from から効く。過去の締めは焼き付け済みの金額を使うので影響しない。
-- ============================================================
create table if not exists nite_rulesets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  business_type text not null default 'cabaret'
    check (business_type in ('cabaret', 'lounge')),   -- キャバクラ / ガールズバー・ラウンジ
  name text not null,
  rules jsonb not null default '{}'::jsonb,
  effective_from date not null,
  is_active boolean not null default true,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- 1店舗に「今効いている版」は1つだけ
create unique index if not exists uq_nite_rulesets_active
  on nite_rulesets (store_id) where is_active and deleted_at is null;

-- ============================================================
-- 4. 卓
-- ============================================================
create table if not exists nite_tables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  code text not null,                              -- 例: A-1 / VIP-1
  kind text not null default 'normal' check (kind in ('normal', 'vip', 'counter')),
  seats integer not null default 4,
  sort integer not null default 0,
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_nite_tables_code
  on nite_tables (store_id, code) where deleted_at is null;

-- ============================================================
-- 5. 伝票
--   business_date = 営業日。深夜2時の会計は前日の売上として扱うため、日付は別に持つ。
--   brought_by_cast_id = このお客様を連れてきた人。後から変更できる（ユーザー指示）。
-- ============================================================
create table if not exists nite_slips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  table_id uuid not null references nite_tables(id),
  business_date date not null,
  guests integer not null default 1 check (guests > 0),

  opened_at timestamptz not null default now(),
  set_minutes integer not null default 60,         -- 現在のセット時間（延長で伸びる）
  closed_at timestamptz,

  brought_by_cast_id uuid references nite_casts(id),
  brought_kind text check (brought_kind in ('douhan', 'referral', 'free')),
                                                   -- douhan=同伴 / referral=紹介 / free=フリー来店

  status text not null default 'open' check (status in ('open', 'closed', 'void')),

  -- 会計（閉じたときに焼き付ける。サービス料率・税率もその時点の値を残す）
  subtotal integer not null default 0,
  service_charge integer not null default 0,
  service_rate numeric(5,4),
  tax integer not null default 0,
  tax_rate numeric(5,4),
  total integer not null default 0,
  payment_method text check (payment_method in ('cash', 'card', 'transfer', 'other')),

  note text,
  created_by uuid references staff(id),
  closed_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_nite_slips_open
  on nite_slips (store_id, status, opened_at desc) where deleted_at is null;
create index if not exists idx_nite_slips_date
  on nite_slips (store_id, business_date) where deleted_at is null;
-- 1つの卓に開いている伝票は1つだけ（二重に開いて売上が割れるのを防ぐ）
create unique index if not exists uq_nite_slips_open_table
  on nite_slips (table_id) where status = 'open' and deleted_at is null;

-- ============================================================
-- 6. 伝票明細
--   ここが給与の源泉。1行に「いくらのものが、誰の分で、バックがいくら付いたか」を残す。
-- ============================================================
create table if not exists nite_slip_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  slip_id uuid not null references nite_slips(id) on delete cascade,

  kind text not null check (kind in (
    'set',                -- セット料金
    'extend',             -- 延長
    'nomination',         -- 本指名
    'inhouse_nomination', -- 場内指名
    'douhan',             -- 同伴
    'cast_drink',         -- キャストドリンク
    'bottle',             -- ボトル・シャンパン
    'food',
    'other'
  )),
  label text not null,
  unit_price integer not null default 0,
  qty integer not null default 1 check (qty > 0),
  amount integer not null default 0,               -- unit_price * qty（税抜・サービス料前）

  cast_id uuid references nite_casts(id),          -- 誰の分か。指名/同伴/ドリンク/ボトルは必須
  back_amount integer not null default 0,          -- 確定バック額（@yozan/core/night-payroll が算出）
  back_basis jsonb,                                -- 根拠（適用ルール・率・元金額）。後から説明できるように

  status text not null default 'active' check (status in ('active', 'void')),
  void_reason text,
  voided_by uuid references staff(id),
  voided_at timestamptz,

  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nite_slip_items_slip
  on nite_slip_items (slip_id, created_at);
create index if not exists idx_nite_slip_items_cast
  on nite_slip_items (cast_id, created_at) where status = 'active';

-- 担当キャストが要る種別
create or replace function app.nite_item_needs_cast(p_kind text) returns boolean
language sql immutable
as $$
  select p_kind in ('nomination', 'inhouse_nomination', 'douhan', 'cast_drink', 'bottle')
$$;

-- ★ 担当が入っていない行が残っている伝票は閉じさせない
create or replace function app.nite_slip_close_guard() returns trigger
language plpgsql
as $$
declare
  missing integer;
begin
  if new.status = 'closed' and coalesce(old.status, '') <> 'closed' then
    select count(*) into missing
      from nite_slip_items i
     where i.slip_id = new.id
       and i.status = 'active'
       and app.nite_item_needs_cast(i.kind)
       and i.cast_id is null;
    if missing > 0 then
      raise exception '担当キャストが入っていない明細が % 件あります。先に担当を入れてください。', missing
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nite_slip_close_guard on nite_slips;
create trigger trg_nite_slip_close_guard before update on nite_slips
  for each row execute function app.nite_slip_close_guard();

-- ============================================================
-- 7. 出勤（時給の計算単位）
--   hourly_wage_applied = アップ条件を当てた後の時給。uplift に「なぜ上がったか」を残す。
-- ============================================================
create table if not exists nite_attendances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  cast_id uuid not null references nite_casts(id),
  business_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  minutes integer not null default 0,
  hourly_wage_base integer not null default 0,
  hourly_wage_applied integer not null default 0,
  uplift jsonb,                                    -- 例: [{"id":"douhan","label":"同伴あり","kind":"percent","value":20}]
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_nite_attendances_day
  on nite_attendances (cast_id, business_date) where deleted_at is null;
create index if not exists idx_nite_attendances_store_date
  on nite_attendances (store_id, business_date) where deleted_at is null;

-- ============================================================
-- 8. シフト（締切とリマインド）
--   キャストは締切を忘れやすい、というのが導入の理由（ユーザー指示）。
--   締切は店が月ごとに決める。誰に何回リマインドを送ったかも残す。
-- ============================================================
create table if not exists nite_shift_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  target_month date not null,                      -- 対象月の1日
  deadline_on date not null,
  remind_days integer[] not null default '{5,1,0}',-- 締切の何日前に送るか
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_nite_shift_periods
  on nite_shift_periods (store_id, target_month) where deleted_at is null;

create table if not exists nite_shift_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  period_id uuid not null references nite_shift_periods(id) on delete cascade,
  cast_id uuid not null references nite_casts(id),
  work_date date not null,
  wish text not null check (wish in ('work', 'off')),
  start_time time,
  douhan_planned boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_nite_shift_requests_day
  on nite_shift_requests (cast_id, work_date);

create table if not exists nite_shift_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  period_id uuid not null references nite_shift_periods(id) on delete cascade,
  cast_id uuid not null references nite_casts(id),
  submitted_at timestamptz,
  reminded jsonb not null default '[]'::jsonb,     -- [{"days_before":5,"sent_at":"..."}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_nite_shift_submissions
  on nite_shift_submissions (period_id, cast_id);

-- ============================================================
-- 9. 日払い（前借り）
--   月次の支給から必ず差し引く。ここを取りこぼすと払い過ぎになる。
-- ============================================================
create table if not exists nite_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  cast_id uuid not null references nite_casts(id),
  business_date date not null,
  amount integer not null check (amount > 0),
  fee integer not null default 0,
  status text not null default 'requested'
    check (status in ('requested', 'paid', 'rejected', 'void')),
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  approved_by uuid references staff(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nite_advances_cast
  on nite_advances (cast_id, business_date desc);

-- ============================================================
-- 10. 月次締め
--   確定(confirmed)したら金額はロック。直す時は nite_payroll_adjustments に
--   「訂正」として1行足す（上書きしない＝あとで説明できる）。
-- ============================================================
create table if not exists nite_closings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  target_month date not null,
  status text not null default 'draft'
    check (status in ('draft', 'reviewing', 'confirmed', 'sent')),
  ruleset_id uuid references nite_rulesets(id),     -- どの版で計算したか
  totals jsonb,                                     -- 支給総額・人数・日払い済など
  confirmed_at timestamptz,
  confirmed_by uuid references staff(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_nite_closings
  on nite_closings (store_id, target_month) where deleted_at is null;

create table if not exists nite_payroll_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  closing_id uuid not null references nite_closings(id) on delete cascade,
  cast_id uuid not null references nite_casts(id),
  work_days integer not null default 0,
  work_minutes integer not null default 0,
  hourly_total integer not null default 0,
  back_total integer not null default 0,
  allowance_total integer not null default 0,       -- 皆勤などの手当
  deduction_total integer not null default 0,       -- 送り・遅刻など
  advance_total integer not null default 0,         -- 日払い済（差し引く）
  gross integer not null default 0,
  net integer not null default 0,
  needs_review boolean not null default false,      -- 日払いが支給を超えた等
  breakdown jsonb,                                  -- 明細（日別・項目別）。確定後の説明用
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_nite_payroll_lines
  on nite_payroll_lines (closing_id, cast_id);

create table if not exists nite_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  closing_id uuid not null references nite_closings(id) on delete cascade,
  cast_id uuid not null references nite_casts(id),
  amount integer not null,                          -- 増減（+/-）
  reason text not null,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_nite_payroll_adjustments
  on nite_payroll_adjustments (closing_id, cast_id);

-- ============================================================
-- RLS: 全テーブル有効・ポリシー無し = service_role専用（本リポジトリの標準形）
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'nite_cast_ranks','nite_casts','nite_rulesets','nite_tables','nite_slips','nite_slip_items',
    'nite_attendances','nite_shift_periods','nite_shift_requests','nite_shift_submissions',
    'nite_advances','nite_closings','nite_payroll_lines','nite_payroll_adjustments'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop trigger if exists set_updated_at on %I', t);
    if t <> 'nite_payroll_adjustments' then
      execute format(
        'create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
    end if;
  end loop;
end $$;

comment on table nite_slip_items is
  '伝票明細。給与の源泉。取り消しは status=''void'' で行は残す。cast_id が空の必須種別が残っていると伝票を閉じられない';
comment on column nite_slip_items.back_basis is
  'バックの根拠（適用ルールID・率・元金額）。設定を変えても過去の給与が動かないよう、計算時点の根拠を焼き付ける';
comment on table nite_rulesets is
  'バック設定の版。rules(jsonb) の型は @yozan/core/night-payroll の RuleSet が正典。1店舗に is_active は1つだけ';
