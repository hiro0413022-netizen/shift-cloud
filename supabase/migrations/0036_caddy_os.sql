-- 0036_caddy_os.sql
-- Caddy OS — キャディ派遣事業のアプリ化（DECISIONS #45）
--
-- 現行運用: CADDIES 2026_N.xlsx（月1ファイル）。シートは 売上 / 委託料 / 委託先 / 取引先 /
-- 年次有給休暇管理簿 / 林和希タイムカード / 収支（空）。
--
-- Excel運用で判明した問題（本設計はこれを構造で潰す）:
--   (1) 委託料シートのNo採番が前月のままコピペされている（2026年6月ファイルに "2026-5-001"）
--       → No は自動採番（cad_dispatches.seq）にし、人が触らない
--   (2) 売上シートと委託料シートが別々 → 同じ派遣の売上と原価が突き合わせられない
--       → 1派遣 = 1行（cad_dispatches）に売上と委託料の両方を持つ
--   (3) 林さん（社員・委託料0）の交通費が委託料シートに入り、給与でも支給され二重計上の危険
--       → partner_id（外注）と staff_id（社員）を排他で持ち、社員の交通費は給与側（#44）へ寄せる
--   (4) 締め日・振込日がバラバラ（月末/20日締め、10日/15日/20日/末日払い）で入金消込ができない
--       → 取引先マスタに締め日・振込日を持ち、請求月を自動判定
--
-- 個人情報: 委託先の住所・生年月日・銀行口座はExcelにあるが、**本テーブルには持たない**
-- （必要になるまで持たない。持つならVault相当の保護が要る / SECURITY.md）。
--
-- 追加のみ（DECISIONS #2）。RLSは標準（#3）: 読みは認証ユーザ、書きは service_role。

-- 1. 取引先（ゴルフ場）
create table if not exists cad_clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text,                              -- G-0001 等（Excelの取引先番号）
  name text not null,
  unit_price integer,                     -- 標準の売上単価（円・税抜）。派遣ごとに上書き可
  closing_day text,                       -- '月末' / '20日' 等
  payment_day text,                       -- '10日' / '15日' / '末日' 等
  has_contract boolean not null default false,
  phone text,
  address text,
  memo text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, name)
);

-- 2. 委託先（業務委託のキャディ）
--    ※ 住所・生年月日・口座は意図的に持たない（上のコメント参照）
create table if not exists cad_partners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text,                              -- C-001 等
  name text not null,
  name_kana text,
  default_fee integer,                    -- 標準の委託料（円/人工）
  default_transport integer not null default 0, -- 標準の交通費（円/回）
  main_course text,                       -- 主な業務ゴルフ場
  contract_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, name)
);

-- 3. 派遣（1行 = キャディ1人を1コースへ1回）
--    売上（取引先へ請求）と原価（委託先へ支払）を同じ行に持つ ＝ 粗利が行単位で出る
create table if not exists cad_dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  seq text,                               -- 表示用の自動採番（2026-06-001）。人は編集しない
  dispatch_date date not null,
  kind text not null default 'dispatch' check (kind in ('dispatch', 'training', 'other')),
  -- 売上側（研修などで売上が無い派遣は client_id / sales_amount を空にする）
  client_id uuid references cad_clients(id),
  sales_amount integer not null default 0 check (sales_amount >= 0), -- 税抜（円）
  -- 原価側（排他: 外注なら partner_id / 社員なら staff_id。社員の人件費は給与側で計上する）
  partner_id uuid references cad_partners(id),
  staff_id uuid references staff(id),
  fee_amount integer not null default 0 check (fee_amount >= 0),        -- 委託料（税抜）
  transport_amount integer not null default 0 check (transport_amount >= 0), -- 交通費
  special_amount integer not null default 0 check (special_amount >= 0),     -- 特別手当
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 社員に委託料を付けるのは二重計上（給与でも払う）。構造で禁止する
  constraint cad_staff_has_no_fee check (staff_id is null or (fee_amount = 0 and special_amount = 0)),
  constraint cad_partner_or_staff check (not (partner_id is not null and staff_id is not null))
);
create index if not exists idx_cad_dispatches_month on cad_dispatches (company_id, dispatch_date) where deleted_at is null;
create index if not exists idx_cad_dispatches_client on cad_dispatches (client_id, dispatch_date) where deleted_at is null;
create index if not exists idx_cad_dispatches_partner on cad_dispatches (partner_id, dispatch_date) where deleted_at is null;

-- RLS（標準 #3）: 読みは認証ユーザ、書きは service_role のみ（アプリのServer Action経由）
alter table cad_clients enable row level security;
alter table cad_partners enable row level security;
alter table cad_dispatches enable row level security;

drop policy if exists cad_clients_read on cad_clients;
create policy cad_clients_read on cad_clients for select to authenticated using (true);
drop policy if exists cad_partners_read on cad_partners;
create policy cad_partners_read on cad_partners for select to authenticated using (true);
drop policy if exists cad_dispatches_read on cad_dispatches;
create policy cad_dispatches_read on cad_dispatches for select to authenticated using (true);

drop trigger if exists trg_cad_clients_updated on cad_clients;
create trigger trg_cad_clients_updated before update on cad_clients for each row execute function app.set_updated_at();
drop trigger if exists trg_cad_partners_updated on cad_partners;
create trigger trg_cad_partners_updated before update on cad_partners for each row execute function app.set_updated_at();
drop trigger if exists trg_cad_dispatches_updated on cad_dispatches;
create trigger trg_cad_dispatches_updated before update on cad_dispatches for each row execute function app.set_updated_at();

/* ============================================================
   財務への自動集約（Money OS と同じ関係 / DECISIONS #31）
   キャディ派遣の月次PLを fin_entries へ upsert する。
     売上高(sales)      = Σ sales_amount
     外注費(outsourcing) = Σ (fee + transport + special)  ※外注(partner)分のみ
   社員（林さん）の人件費は給与側（payroll / #44）が計上するため**ここでは触らない**。
   ＝ 台帳の交通費を外注費に入れて二重計上する事故（Excel運用の罠）を構造で防ぐ。
   ============================================================ */
create or replace function refresh_caddy_finance(p_company_id uuid, p_month date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seg uuid;
  v_cat_sales uuid;
  v_cat_out uuid;
  r record;
begin
  select id into v_seg from fin_segments where company_id = p_company_id and code = 'caddy' and deleted_at is null;
  if v_seg is null then return; end if;
  select id into v_cat_sales from fin_categories where code = 'sales' and deleted_at is null limit 1;
  select id into v_cat_out from fin_categories where code = 'outsourcing' and deleted_at is null limit 1;

  for r in
    select date_trunc('month', dispatch_date)::date m,
           sum(sales_amount) sales,
           sum(case when partner_id is not null then fee_amount + transport_amount + special_amount else 0 end) cost
    from cad_dispatches
    where company_id = p_company_id and deleted_at is null
      and (p_month is null or date_trunc('month', dispatch_date)::date = p_month)
    group by 1
  loop
    insert into fin_entries (company_id, segment_id, category_id, target_month, amount, memo, source)
    values (p_company_id, v_seg, v_cat_sales, r.m, r.sales, 'Caddy OS（派遣台帳から自動集計）', 'caddy_os')
    on conflict (company_id, segment_id, category_id, target_month)
    do update set amount = excluded.amount, memo = excluded.memo, source = excluded.source,
                  deleted_at = null, updated_at = now();

    insert into fin_entries (company_id, segment_id, category_id, target_month, amount, memo, source)
    values (p_company_id, v_seg, v_cat_out, r.m, r.cost, 'Caddy OS（委託料+交通費+特別手当。社員分は給与側）', 'caddy_os')
    on conflict (company_id, segment_id, category_id, target_month)
    do update set amount = excluded.amount, memo = excluded.memo, source = excluded.source,
                  deleted_at = null, updated_at = now();
  end loop;
end;
$$;

revoke execute on function refresh_caddy_finance(uuid, date) from anon, authenticated;
