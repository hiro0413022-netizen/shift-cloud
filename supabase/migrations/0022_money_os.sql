-- 0022_money_os.sql
-- Money OS フェーズ1（薄い共通コア）: 現場のお金（売上・現金出納・金種・経費）＋カード/口座CSV取込
-- 設計: docs/modules/money-os/SYSTEM.md
-- 方針: 独立アプリ（apps/money-golfwing）から書込 → 集約 → 既存fin_entries → refresh_finance_kpis
--       既存fin_entriesは無改修（upsert利用）。段別権限はアプリ層(mon_grants)で担保、RLSは既存標準のテナント分離。

-- ============================================================
-- 0. 事業セグメント補完（fin_segmentsを共通のsegmentとして流用）
-- ============================================================
do $$
declare v_company uuid;
begin
  select id into v_company from companies limit 1;
  insert into fin_segments (company_id, code, name, sort_order) values
    (v_company, 'himeji', '姫路インドアゴルフ', 15),
    (v_company, 'sns', 'SNS・Web運用', 50)
  on conflict (company_id, code) do nothing;
end $$;

-- ============================================================
-- 1. mon_grants — ユーザー×事業×役割（段別権限。アプリ層で参照）
-- ============================================================
create table mon_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  user_id uuid not null,                                   -- auth.users.id
  segment_id uuid not null references fin_segments(id),
  role text not null check (role in ('input', 'manager', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, user_id, segment_id)
);
create index idx_mon_grants_user on mon_grants (company_id, user_id);

-- ============================================================
-- 2. mon_sales — 売上（共通コア基本列＋事業別detail）
-- ============================================================
create table mon_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  segment_id uuid not null references fin_segments(id),
  sold_on date not null,
  category text not null,                                  -- 利用料 / 月会費 / 販売 / その他
  customer_name text,
  member_kind text,                                        -- 会員 / ビジター 等（任意）
  amount numeric not null default 0,                       -- 税抜金額（売価×個数）
  tax_included numeric,                                    -- 税込（任意）
  pay_method text,                                         -- 現金 / Airペイ / SBペイメント / 振込 …
  memo text,
  detail jsonb not null default '{}'::jsonb,               -- GOLF WING拡張（品目/メーカー/品名/定価/割引/個数/担当プロ等）
  entered_by text,
  source text not null default 'app',                      -- app / csv / migration
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_mon_sales_seg_month on mon_sales (company_id, segment_id, sold_on);

-- ============================================================
-- 3. mon_cash_ledger — 現金出納帳（入金/出金/残高）
-- ============================================================
create table mon_cash_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  segment_id uuid not null references fin_segments(id),
  entry_date date not null,
  summary text,                                            -- 摘要区分（利用料/返金/備品 等）
  description text,                                        -- 内容
  counterpart text,                                        -- 相手・顧客
  in_amount numeric not null default 0,                    -- 入金
  out_amount numeric not null default 0,                   -- 出金
  balance numeric,                                         -- 現金残高（保存時点）
  diff numeric,                                            -- 差異
  memo text,
  entered_by text,
  source text not null default 'app',                      -- app / sales(現金売上から自動) / migration
  source_ref uuid,                                         -- mon_sales.id 等（自動連携元）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_mon_cash_ledger_seg_date on mon_cash_ledger (company_id, segment_id, entry_date);

-- ============================================================
-- 4. mon_cash_count — 金種棚卸（レジ/金庫の時点カウント）
-- ============================================================
create table mon_cash_count (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  segment_id uuid not null references fin_segments(id),
  counted_at timestamptz not null,
  location text not null,                                  -- register / safe
  denominations jsonb not null default '{}'::jsonb,        -- {"10000": 83, "5000": 11, ...}
  total numeric not null default 0,                        -- カウント合計（自動）
  theoretical numeric,                                     -- 理論残高（出納帳から）
  diff numeric,                                            -- total - theoretical（自動）
  counted_by text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_mon_cash_count_seg on mon_cash_count (company_id, segment_id, counted_at);

-- ============================================================
-- 5. mon_expense — 経費（現場入力）
-- ============================================================
create table mon_expense (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  segment_id uuid not null references fin_segments(id),
  spent_on date not null,
  item text,                                               -- 項目
  payee text,                                              -- 支払先
  amount numeric not null default 0,                       -- 正の値
  method text,                                             -- 現金 / 振込 / カード
  category text,                                           -- 科目（mon_category_mapで正規化）
  memo text,
  settled_by text,
  source text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_mon_expense_seg_month on mon_expense (company_id, segment_id, spent_on);

-- ============================================================
-- 6. mon_bank_source — 取込元マスタ（AMEX / 尼崎信金 …）
-- ============================================================
create table mon_bank_source (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,                                      -- amex / amashin
  name text not null,
  type text not null check (type in ('card', 'bank')),
  mapping jsonb not null default '{}'::jsonb,              -- CSV列→項目、符号ルール
  default_segment_id uuid references fin_segments(id),
  default_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, code)
);

-- ============================================================
-- 7. mon_bank_txn — カード・口座明細（CSV取込先）
-- ============================================================
create table mon_bank_txn (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  source_id uuid not null references mon_bank_source(id),
  txn_date date not null,
  description text,                                        -- 摘要・利用先
  amount numeric not null default 0,                       -- 出金= –、入金= +
  balance numeric,                                         -- 口座のみ
  segment_id uuid references fin_segments(id),             -- 配賦先（未配賦=null）
  category text,                                           -- fin_categories.code（確定時）
  status text not null default 'unassigned' check (status in ('unassigned', 'confirmed', 'ignored')),
  memo text,
  raw jsonb not null default '{}'::jsonb,                  -- 原文1行
  dedup_key text not null,                                 -- source+日付+金額+摘要ハッシュ
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, source_id, dedup_key)
);
create index idx_mon_bank_txn_status on mon_bank_txn (company_id, status, txn_date);

-- ============================================================
-- 8. mon_category_map — 区分 → fin_categories.code
-- ============================================================
create table mon_category_map (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  src_kind text not null check (src_kind in ('sales', 'expense')),
  src_value text not null,                                 -- 例: 利用料 / 月会費 / 送料 / 家賃
  fin_category_code text not null,                         -- fin_categories.code
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, src_kind, src_value)
);

-- ============================================================
-- 9. トリガー＋RLS（既存標準のテナント分離を流用。段別はアプリ層mon_grants）
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'mon_grants','mon_sales','mon_cash_ledger','mon_cash_count',
    'mon_expense','mon_bank_source','mon_bank_txn','mon_category_map'
  ] loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- ============================================================
-- 10. シード（モジュール登録 / 取込元 / 区分マッピング）
-- ============================================================
do $$
declare v_company uuid;
begin
  select id into v_company from companies limit 1;

  -- モジュール（設計中。実装完了でliveに更新）
  insert into modules (company_id, code, name, description, status, sort_order)
  values (v_company, 'money', 'お金管理（現場経理）',
          '事業別の売上・現金出納・金種・経費・カード/口座CSV取込。独立アプリ、fin_entriesへ自動集約', 'designing', 34)
  on conflict (company_id, code) do update set description = excluded.description;

  -- 取込元（実CSVサンプルから確定したmapping）
  --   AMEX : 金額列は「支払=正」。amount = -金額（利用→出金、返金→入金）。
  --   信金 : 出金/入金カラム分離。amount = 入金 - 出金。残高・取引区分あり。
  insert into mon_bank_source (company_id, code, name, type, mapping) values
    (v_company, 'amex', 'アメリカン・エキスプレス', 'card',
     '{"encoding":"cp932","header_row":0,"date_col":"ご利用日","desc_col":"ご利用内容","amount_col":"金額","cardholder_col":"カード会員様名","amount_rule":"charge_positive","date_format":"YYYY/MM/DD"}'::jsonb),
    (v_company, 'amashin', '尼崎信用金庫', 'bank',
     '{"encoding":"cp932","header_row":0,"date_col":"勘定日","out_col":"出金金額（円）","in_col":"入金金額（円）","balance_col":"残高（円）","kind_col":"取引区分","desc_col":"摘要","amount_rule":"in_minus_out","date_format":"JP_ERA_YMD"}'::jsonb)
  on conflict (company_id, code) do update set mapping = excluded.mapping, type = excluded.type;

  -- 区分マッピング（初期値。運用で追加）
  insert into mon_category_map (company_id, src_kind, src_value, fin_category_code) values
    (v_company, 'sales', '利用料', 'sales'),
    (v_company, 'sales', '月会費', 'sales'),
    (v_company, 'sales', '販売', 'sales'),
    (v_company, 'sales', 'その他', 'other_income'),
    (v_company, 'expense', '送料', 'other_expense'),
    (v_company, 'expense', '家賃', 'rent'),
    (v_company, 'expense', '水道光熱費', 'utility'),
    (v_company, 'expense', '広告', 'ad'),
    (v_company, 'expense', '備品', 'supplies'),
    (v_company, 'expense', '外注', 'outsourcing'),
    (v_company, 'expense', '仕入', 'cogs')
  on conflict (company_id, src_kind, src_value) do nothing;
end $$;

-- ============================================================
-- 11. refresh_money_to_finance — mon_* → fin_entries（事業×科目×月）
--     売上(mon_sales)＋現場経費(mon_expense)＋カード/口座確定(mon_bank_txn) を集約。
--     source='money'の行のみ機械管理（手入力のfin_entriesは別sourceで温存）。
-- ============================================================
create or replace function refresh_money_to_finance(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
begin
  -- 当モジュール由来(source='money')の既存行を一旦論理クリア（金額も0化して再集計の二重計上を防ぐ）
  update fin_entries set deleted_at = now(), amount = 0
  where company_id = p_company_id and source = 'money' and deleted_at is null;

  -- (a) 売上 → revenue系
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, s.segment_id, fc.id, date_trunc('month', s.sold_on)::date,
         sum(s.amount), 'money', 'Money OS自動集約(売上)'
  from mon_sales s
  join mon_category_map m
    on m.company_id = p_company_id and m.src_kind = 'sales' and m.src_value = s.category and m.deleted_at is null
  join fin_categories fc
    on fc.company_id = p_company_id and fc.code = m.fin_category_code and fc.deleted_at is null
  where s.company_id = p_company_id and s.deleted_at is null
  group by s.segment_id, fc.id, date_trunc('month', s.sold_on)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = excluded.amount, source = 'money', deleted_at = null, updated_at = now();

  -- (b) 現場経費 → 科目（未マップは other_expense）
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, e.segment_id, fc.id, date_trunc('month', e.spent_on)::date,
         sum(e.amount), 'money', 'Money OS自動集約(経費)'
  from mon_expense e
  join fin_categories fc
    on fc.company_id = p_company_id and fc.deleted_at is null
   and fc.code = coalesce(
        (select m.fin_category_code from mon_category_map m
         where m.company_id = p_company_id and m.src_kind = 'expense'
           and m.src_value = e.category and m.deleted_at is null limit 1),
        'other_expense')
  where e.company_id = p_company_id and e.deleted_at is null
  group by e.segment_id, fc.id, date_trunc('month', e.spent_on)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = fin_entries.amount + excluded.amount, source = 'money', deleted_at = null, updated_at = now();

  -- (c) カード/口座 確定分 → 出金(amount<0)を経費として科目別集計（未配賦はhqへ寄せる）
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)::date,
         sum(abs(t.amount)), 'money', 'Money OS自動集約(カード/口座)'
  from mon_bank_txn t
  cross join lateral (select id from fin_segments where company_id = p_company_id and code = 'hq' and deleted_at is null limit 1) hq
  join fin_categories fc
    on fc.company_id = p_company_id and fc.deleted_at is null
   and fc.code = coalesce(t.category, 'other_expense')
  where t.company_id = p_company_id and t.deleted_at is null
    and t.status = 'confirmed' and t.amount < 0
  group by coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = fin_entries.amount + excluded.amount, source = 'money', deleted_at = null, updated_at = now();

  -- KPI再集計（既存関数を再利用）
  perform refresh_finance_kpis(p_company_id);
end;
$func$;

comment on function refresh_money_to_finance(uuid) is
  'Money OSの現場データ(mon_sales/mon_expense/mon_bank_txn)を事業×科目×月でfin_entriesへ集約し、finance KPIを再集計。保存時・日次で呼ぶ';

revoke execute on function refresh_money_to_finance(uuid) from public, anon, authenticated;
