-- 0086: Inventory OS 在庫・棚卸 inv_*（DECISIONS #96）
--
-- 背景:
--   物販在庫は 202606_ゴルフウィング在庫リスト.xlsm（VBA付き）で管理されていた。
--   362品番 / 最新棚卸1,259個 / 仕入単価ベース約277万円。
--   ただしこれは「棚卸台帳」であって在庫台帳ではない。月1回の実地カウントの記録だけで、
--   入荷・販売による増減が追えないため「なぜ減ったか」が分からない。
--   さらに月ごとに4列（確認日・時間・担当・数量）が横に増える設計で、7ヶ月で43列に達していた。
--
-- 設計の核心は「3層分離」:
--   inv_items          … 品番マスタ（管理番号・品目・メーカー・仕様・保管場所・単価・適正在庫）
--   inv_movements      … 入出庫1件＝1行（入荷/販売/工房使用/棚卸調整/破損/移動）。エクセルに無かった層
--   inv_count_sessions … 棚卸1回＝1行  ┐ エクセルの横持ち（月＝列）を縦持ちに変換して収める
--   inv_counts         … 棚卸明細1品番＝1行 ┘
--
-- 理論在庫と実地在庫:
--   理論在庫 = 直近の確定棚卸の数量 + その棚卸日以降の movements 合計（ビュー inv_stock）
--   棚卸を確定すると、実地と理論の差が kind='adjust' の movements として自動起票される。
--   money-os の金種棚卸（mon_cash_count）とまったく同じ思想。
--
-- 方針:
--   - RLSは有効・ポリシーなし＝service_role専用（本リポジトリの標準形 #65）
--   - 新関数は service_role に明示的に EXECUTE を付ける（#65以降のルール。忘れるとサイレント破壊）
--   - 日付は date 型で持ち、「今日」の解決はアプリ側の lib/jst.ts に任せる（#73）
--   - store_id で店舗別在庫に対応（GOLF WING 宝塚 / FRANK GOLF 姫路）

-- ============================================================
-- 1) コード表（品目・メーカーの略号）
--    エクセルの「コード表」シート相当。管理番号 DRC-TM-001 の DRC / TM がこれ
-- ============================================================
create table if not exists inv_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  kind text not null check (kind in ('category', 'maker')),
  name text not null,                       -- 'ドライバークラブ' / 'テーラーメイド'
  abbr text not null,                       -- 'DRC' / 'TM'（英大文字2〜3字）
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_inv_codes_abbr
  on inv_codes(company_id, kind, abbr) where deleted_at is null;
create unique index if not exists uq_inv_codes_name
  on inv_codes(company_id, kind, name) where deleted_at is null;

comment on table inv_codes is '品目・メーカーの略号マスタ。管理番号の採番に使う（エクセル「コード表」シート相当）';
comment on column inv_codes.abbr is '英大文字2〜3字。kind内で一意＝重複チェックはDBのunique indexが最終防衛';

-- ============================================================
-- 2) 品番マスタ
-- ============================================================
create table if not exists inv_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),      -- null = 全社共通（当面はGOLF WING宝塚を入れる）
  code text not null,                       -- 管理番号 'DRC-TM-001'
  category text not null,                   -- 品目名（inv_codes.name のスナップショット）
  maker text not null,                      -- メーカー名
  name text not null,                       -- 商品名
  spec text,                                -- 仕様
  variant text,                             -- カラー、仕様
  unit text not null default '個',
  location1 text,                           -- 保管場所１（'グリップホルダーに陳列' 等）
  location2 text,                           -- 保管場所２（'棚下収納にもあり' 等）
  list_price numeric(12,2),                 -- 定価
  cost_price numeric(12,2),                 -- 仕入単価（在庫評価はこちらを使う）
  reorder_point integer,                    -- 適正在庫（これを割ったら発注候補。inventory_ai が見る）
  status text not null default 'active'
    check (status in ('active', 'discontinued')),  -- discontinued = 廃番（棚卸対象から外す）
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_inv_items_code
  on inv_items(company_id, code) where deleted_at is null;
create index if not exists idx_inv_items_location
  on inv_items(company_id, store_id, location1) where deleted_at is null and status = 'active';
create index if not exists idx_inv_items_category
  on inv_items(company_id, category) where deleted_at is null;

comment on table inv_items is '在庫品番マスタ。エクセル「ゴルフウィング在庫リスト」のA〜I・AN〜AO列に相当';
comment on column inv_items.reorder_point is '適正在庫。理論在庫がこれ以下で発注候補リストに載る（inventory_ai / migration 0006でplanned済）';
comment on column inv_items.status is 'discontinued にすると棚卸画面に出なくなる。数量ゼロのまま残る品番（移行時点で58件）の整理用';

-- ============================================================
-- 3) 入出庫台帳（エクセルに無かった層）
-- ============================================================
create table if not exists inv_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  item_id uuid not null references inv_items(id),
  store_id uuid references stores(id),
  occurred_on date not null,                -- 発生日（JST。アプリ側 lib/jst.ts で解決する #73）
  kind text not null check (kind in (
    'receipt',    -- 入荷（golfwing の発注→入荷から自動起票）
    'sale',       -- 販売（money-os の物販売上から起票）
    'workshop',   -- 工房使用（組み上げでヘッド・シャフト・グリップを消費）
    'adjust',     -- 棚卸調整（実地と理論の差。inv_apply_count が自動起票）
    'damage',     -- 破損・廃棄
    'transfer'    -- 店舗間移動
  )),
  qty integer not null check (qty <> 0),     -- 入庫は正、出庫は負
  unit_cost numeric(12,2),                   -- そのときの仕入単価（後日の単価改定に引きずられない）
  source_app text,                           -- 'golfwing' / 'money-os' / 'inventory-os'
  source_id uuid,                            -- 連携元テーブルの主キー（receipt_items.id など）
  memo text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_inv_mov_item
  on inv_movements(item_id, occurred_on desc) where deleted_at is null;
create index if not exists idx_inv_mov_company
  on inv_movements(company_id, occurred_on desc) where deleted_at is null;
-- 同じ連携元から二重に起票しない（golfwing の入荷を再送しても増えない）
create unique index if not exists uq_inv_mov_source
  on inv_movements(source_app, source_id) where deleted_at is null and source_id is not null;

comment on table inv_movements is '入出庫1件＝1行。入庫は qty 正・出庫は負。これが無かったため従来は「なぜ減ったか」が追えなかった';
comment on index uq_inv_mov_source is '連携元1レコードにつき1入出庫。golfwing入荷の再送・money-os再集計での二重計上を防ぐ';

-- ============================================================
-- 4) 棚卸（1回＝1セッション）
-- ============================================================
create table if not exists inv_count_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  counted_on date not null,                 -- 基準日（月末）
  label text,                               -- '2026年6月末 棚卸'
  status text not null default 'open'
    check (status in ('open', 'closed')),   -- closed = 確定済（差異をmovementsに起票済み）
  closed_at timestamptz,
  total_qty integer not null default 0,     -- 確定時点のスナップショット
  total_value numeric(14,2) not null default 0,  -- 仕入単価ベースの在庫評価額
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_inv_count_session
  on inv_count_sessions(company_id, store_id, counted_on) where deleted_at is null;
create index if not exists idx_inv_count_session_recent
  on inv_count_sessions(company_id, counted_on desc) where deleted_at is null;

comment on table inv_count_sessions is '棚卸1回＝1行。エクセルでは月ごとに4列が横に増えていたものを縦持ちにした';
comment on column inv_count_sessions.total_value is '仕入単価ベースの在庫評価額。月次でmoney-osの売上原価・report-osの物販セクションへ渡す';

create table if not exists inv_counts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  session_id uuid not null references inv_count_sessions(id) on delete cascade,
  item_id uuid not null references inv_items(id),
  qty integer not null check (qty >= 0),    -- 実地カウント数
  theoretical integer,                      -- カウント時点の理論在庫（確定時に保存）
  diff integer,                             -- qty - theoretical
  counted_at timestamptz not null default now(),
  counted_by uuid references staff(id),
  counted_by_name text,                     -- 移行データ用（'古川'・'小川・古川' など staff に紐付かない記録）
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_inv_counts_item
  on inv_counts(session_id, item_id);
create index if not exists idx_inv_counts_item
  on inv_counts(item_id, counted_at desc);

comment on table inv_counts is '棚卸明細。1セッション×1品番＝1行。エクセルのM/Q/U/Y/AC/AG/AK列（月別数量）に相当';
comment on column inv_counts.counted_by_name is 'エクセル移行分は担当欄が氏名テキスト（複数名の連名もある）ためstaff未紐付け。新規入力はcounted_byを使う';

-- ============================================================
-- 5) 理論在庫ビュー
--    直近の確定棚卸を起点に、それ以降の入出庫を加算する。
--    全期間の movements を積む方式にしないのは、移行時点で過去の入出庫が存在しないため。
-- ============================================================
create or replace view inv_stock as
select
  i.id                as item_id,
  i.company_id,
  i.store_id,
  i.code,
  i.category,
  i.maker,
  i.name,
  i.spec,
  i.variant,
  i.unit,
  i.location1,
  i.location2,
  i.list_price,
  i.cost_price,
  i.reorder_point,
  i.status,
  b.counted_on        as base_on,           -- 起点にした棚卸日
  coalesce(b.qty, 0)  as base_qty,          -- そのときの実地数量
  coalesce(b.qty, 0) + coalesce(m.delta, 0) as qty,   -- 理論在庫
  coalesce(m.delta, 0) as delta_since,      -- 棚卸以降の増減
  (coalesce(b.qty, 0) + coalesce(m.delta, 0)) * coalesce(i.cost_price, 0) as value,
  (i.reorder_point is not null
    and coalesce(b.qty, 0) + coalesce(m.delta, 0) <= i.reorder_point) as needs_reorder
from inv_items i
left join lateral (
  select c.qty, s.counted_on
  from inv_counts c
  join inv_count_sessions s on s.id = c.session_id
  where c.item_id = i.id and s.deleted_at is null and s.status = 'closed'
  order by s.counted_on desc
  limit 1
) b on true
left join lateral (
  select sum(mv.qty) as delta
  from inv_movements mv
  where mv.item_id = i.id
    and mv.deleted_at is null
    and (b.counted_on is null or mv.occurred_on > b.counted_on)
) m on true
where i.deleted_at is null;

comment on view inv_stock is '理論在庫＝直近の確定棚卸＋それ以降の入出庫。needs_reorder が true の品番が発注候補（inventory_ai）';

-- ============================================================
-- 6) 管理番号の採番
--    エクセルのVBAフォームが持っていた機能。連番はDBで採る（同時登録の衝突を防ぐ）
-- ============================================================
create or replace function public.inv_next_code(
  p_company_id uuid,
  p_category text,
  p_maker text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat  text;
  v_mk   text;
  v_next integer;
begin
  select abbr into v_cat from inv_codes
   where company_id = p_company_id and kind = 'category'
     and name = p_category and deleted_at is null;
  if v_cat is null then
    raise exception '品目「%」の略号がコード表にありません。先にコード表へ追加してください', p_category;
  end if;

  select abbr into v_mk from inv_codes
   where company_id = p_company_id and kind = 'maker'
     and name = p_maker and deleted_at is null;
  if v_mk is null then
    raise exception 'メーカー「%」の略号がコード表にありません。先にコード表へ追加してください', p_maker;
  end if;

  -- 論理削除済みも含めて最大連番を採る（欠番を再利用すると過去伝票と衝突するため）
  select coalesce(max((regexp_replace(code, '^.*-', ''))::integer), 0) + 1
    into v_next
    from inv_items
   where company_id = p_company_id
     and code like v_cat || '-' || v_mk || '-%'
     and code ~ ('^' || v_cat || '-' || v_mk || '-[0-9]+$');

  return v_cat || '-' || v_mk || '-' || lpad(v_next::text, 3, '0');
end;
$$;

grant execute on function public.inv_next_code(uuid, text, text) to service_role;
comment on function public.inv_next_code is '管理番号の採番（品目略号-メーカー略号-連番）。エクセルVBAの新規追加フォーム相当。連番はDBで採り同時登録の衝突を防ぐ';

-- ============================================================
-- 7) 棚卸の確定
--    実地と理論の差を kind='adjust' の入出庫として起票し、セッションを closed にする。
--    これで「棚卸を締めた瞬間から理論在庫が実地に一致する」状態になる。
-- ============================================================
create or replace function public.inv_close_count(
  p_session_id uuid,
  p_staff_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_store   uuid;
  v_on      date;
  v_status  text;
  v_adjusted integer := 0;
  v_qty     integer := 0;
  v_value   numeric(14,2) := 0;
  r         record;
begin
  select company_id, store_id, counted_on, status
    into v_company, v_store, v_on, v_status
    from inv_count_sessions where id = p_session_id and deleted_at is null;

  if v_company is null then
    raise exception '棚卸セッションが見つかりません';
  end if;
  if v_status = 'closed' then
    raise exception 'この棚卸はすでに確定済みです';
  end if;

  for r in
    select c.id as count_id, c.item_id, c.qty, s.qty as theo, s.cost_price
      from inv_counts c
      join inv_stock s on s.item_id = c.item_id
     where c.session_id = p_session_id
  loop
    -- 差異を調整として起票（差が無ければ何も入れない）
    if r.qty <> r.theo then
      insert into inv_movements
        (company_id, item_id, store_id, occurred_on, kind, qty, unit_cost,
         source_app, source_id, memo, created_by)
      values
        (v_company, r.item_id, v_store, v_on, 'adjust', r.qty - r.theo, r.cost_price,
         'inventory-os', r.count_id, '棚卸調整', p_staff_id);
      v_adjusted := v_adjusted + 1;
    end if;

    update inv_counts
       set theoretical = r.theo,
           diff = r.qty - r.theo,
           updated_at = now()
     where id = r.count_id;

    v_qty   := v_qty + r.qty;
    v_value := v_value + r.qty * coalesce(r.cost_price, 0);
  end loop;

  update inv_count_sessions
     set status = 'closed',
         closed_at = now(),
         total_qty = v_qty,
         total_value = v_value,
         updated_at = now()
   where id = p_session_id;

  -- 締めたことをイベントに残す（ホームのティッカー・CEO AI日次に合流 #79/#83）
  begin
    insert into company_events (company_id, event_type, title, source, source_type, occurred_at)
    values (v_company, 'inventory.count_closed',
            left(to_char(v_on, 'YYYY年MM月') || 'の棚卸を確定しました（' || v_qty || '点 / '
                 || to_char(v_value, 'FM999,999,999') || '円' ||
                 case when v_adjusted > 0 then ' / 差異' || v_adjusted || '件' else '' end || '）', 120),
            'db_function', 'system', now());
  exception when others then
    null; -- イベント記録の失敗で棚卸を止めない
  end;

  return jsonb_build_object(
    'ok', true, 'adjusted', v_adjusted, 'total_qty', v_qty, 'total_value', v_value);
end;
$$;

grant execute on function public.inv_close_count(uuid, uuid) to service_role;
comment on function public.inv_close_count is
  '棚卸の確定。実地と理論の差をadjustとしてinv_movementsに起票→セッションをclosed→評価額を確定→company_eventsに記録';

-- ============================================================
-- 8) RLS（有効・ポリシーなし＝service_role専用。#65の標準形）
-- ============================================================
alter table inv_codes          enable row level security;
alter table inv_items          enable row level security;
alter table inv_movements      enable row level security;
alter table inv_count_sessions enable row level security;
alter table inv_counts         enable row level security;

-- ============================================================
-- 9) 月次の棚卸資産と売上原価
--    money-os の粗利計算と report-os の物販セクションが直接読む（同一DBなのでビューで繋ぐ）。
--    売上原価 = 期首在庫 + 当月仕入 − 期末在庫（三分法）。
--    棚卸が無い月は行が出ない。推計はしない＝嘘の数字をPLに流さない。
-- ============================================================
create or replace view inv_monthly_valuation as
with closing as (
  -- 各月の「月内で最後に確定した棚卸」を期末在庫とする
  select distinct on (s.company_id, s.store_id, date_trunc('month', s.counted_on))
         s.company_id, s.store_id,
         date_trunc('month', s.counted_on)::date as m,
         s.counted_on, s.total_qty, s.total_value
  from inv_count_sessions s
  where s.deleted_at is null and s.status = 'closed'
  order by s.company_id, s.store_id, date_trunc('month', s.counted_on), s.counted_on desc
),
purchases as (
  select mv.company_id, mv.store_id,
         date_trunc('month', mv.occurred_on)::date as m,
         sum(mv.qty * coalesce(mv.unit_cost, 0)) as purchase_value
  from inv_movements mv
  where mv.deleted_at is null and mv.kind = 'receipt'
  group by 1,2,3
)
select
  c.company_id,
  c.store_id,
  c.m                           as month,
  c.counted_on,
  prev.total_value              as opening_value,   -- 期首在庫（前月末の確定棚卸）
  c.total_value                 as closing_value,   -- 期末在庫
  c.total_qty                   as closing_qty,
  coalesce(p.purchase_value, 0) as purchase_value,  -- 当月仕入（入荷の原価合計）
  case when prev.total_value is null then null
       else prev.total_value + coalesce(p.purchase_value, 0) - c.total_value end as cogs,
  case when prev.total_value is null then null
       else (prev.total_value + c.total_value) / 2 end as average_value           -- 在庫回転日数の分母
from closing c
left join closing prev
  on prev.company_id = c.company_id
 and prev.store_id is not distinct from c.store_id
 and prev.m = (c.m - interval '1 month')::date
left join purchases p
  on p.company_id = c.company_id
 and p.store_id is not distinct from c.store_id
 and p.m = c.m;

comment on view inv_monthly_valuation is
  '月次の棚卸資産・仕入・売上原価。money-osの粗利とreport-osの物販セクションが読む。棚卸が無い月は行が出ない（推計はしない）';
