-- 0035_payroll_allowances.sql
-- 給与の「手当」と「月給制」に対応する（DECISIONS #44）
--
-- 背景: 実際のGOLF WING給与明細を解析したところ、Shift Cloudの給与計算に3つの穴があった。
--   (1) 手当が入らない  … buildPayroll は allowance_amount: 0 固定。実際はパーソナル
--       レッスン（単価×件数）・フィッティング紹介料・コンペ・ラウンドレッスンの手当がある
--   (2) 月給制が無い    … staff_wages.monthly_salary 列はあるが計算が時給しか見ていない。
--       林(270,000)・山本(200,000)・役員(80,000) は月給
--   (3) 交通費が日額固定 … 月給者は実費精算（林: 5月14,840円 / 6月4,680円と変動）
--
-- 検証済みの計算式（給与明細と1円一致）:
--   総支給 = 時給×実労働時間 + 交通費日額×出勤日数 + Σ(単価×件数) + 特別手当
--   月給者 = 月給 + 実費交通費 + Σ手当
--
-- 追加のみ（DECISIONS #2）。RLSは給与系の慣例に従い service_role 専用（ポリシーを作らない）。

-- 1. 手当の単価マスタ（スタッフ別・履歴つき）
--    例: 安東さん パーソナル単価2,000 / フィッティング紹介料3,500
create table if not exists staff_allowance_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  kind text not null check (kind in ('personal', 'fitting_referral', 'other')),
  unit_price integer not null check (unit_price >= 0), -- 円（integer / DECISIONS #4）
  label text,                       -- kind='other' のときの表示名
  effective_from date not null,     -- この日以降の勤務に適用（#39の日付按分と同じ思想）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_staff_allowance_rates_staff on staff_allowance_rates (staff_id, kind, effective_from desc);

-- 2. 月次の手当実績（件数 or 金額を人が入力する。給与計算がこれを合算する）
--    kind:
--      personal         パーソナルレッスン（単価×件数）
--      fitting_referral フィッティング紹介料（単価×件数）
--      compe            コンペ（金額直接。例 20,000）
--      round_lesson     ラウンドレッスン（金額直接。例 33,000）
--      commute_actual   交通費の実費精算（月給者。commute_amount に加算される）
--      other            その他（金額直接）
create table if not exists payroll_allowances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  period_id uuid not null references payroll_periods(id),
  staff_id uuid not null references staff(id),
  kind text not null check (kind in ('personal', 'fitting_referral', 'compe', 'round_lesson', 'commute_actual', 'other')),
  unit_price integer,                                  -- 単価×件数で計算する種別のみ
  quantity integer,                                    -- 同上（件数）
  amount integer not null check (amount >= 0),         -- 実際に支給する額（円）。単価×件数の結果 or 直接入力
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_payroll_allowances_period on payroll_allowances (period_id, staff_id) where deleted_at is null;

-- 3. 賃金の種別を明示する（monthly_salary が入っていれば月給、という暗黙ルールをやめる）
alter table staff_wages add column if not exists wage_type text not null default 'hourly'
  check (wage_type in ('hourly', 'monthly'));
comment on column staff_wages.wage_type is 'hourly=時給×実労働時間 / monthly=月給固定（monthly_salaryを使う）';

-- RLS: 給与系は service_role 専用（ポリシーを作らない = 誰も直接読めない / #3の例外）
alter table staff_allowance_rates enable row level security;
alter table payroll_allowances enable row level security;

-- updated_at 自動更新（既存テーブルと同じ関数を使う）
drop trigger if exists trg_staff_allowance_rates_updated on staff_allowance_rates;
create trigger trg_staff_allowance_rates_updated before update on staff_allowance_rates
  for each row execute function app.set_updated_at();
drop trigger if exists trg_payroll_allowances_updated on payroll_allowances;
create trigger trg_payroll_allowances_updated before update on payroll_allowances
  for each row execute function app.set_updated_at();
