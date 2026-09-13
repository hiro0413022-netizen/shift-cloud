-- 適用済み: 2026-09-12（Supabase migration名 craft_os）
-- =====================================================================
-- 0160_craft_os.sql
-- craft-os: フィッティング表紙 → 見積 → 注文書 → 工房 → 発注／売上
--
-- 方針
--   * 定価は持たない。正典は golfwing.products（発注管理が保守している）
--   * 試打NO（1〜1490）は変えない＝ラックのバーコードと紙の運用がこの番号
--   * 割引とフィッティング料返金の計算式は @yozan/core 1か所。DBはルール表だけ持つ
--   * 工房は「目標（範囲）」と「実測」を別の列に持つ
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 試打シャフト台帳（ラック）
-- ---------------------------------------------------------------------
create table if not exists golfwing.demo_shafts (
  id            bigserial primary key,
  company_id    uuid not null default app.current_company_id(),
  store_id      uuid references public.stores(id),
  demo_no       integer not null,                               -- 試打NO＝バーコード
  product_id    bigint references golfwing.products(id),        -- ← 定価はここから引く
  shelf         text,                                           -- 棚番号（A-1 など）
  club_type     text,                                           -- DR / FW / UT
  status        text not null default '在庫'
                  check (status in ('在庫','廃盤','貸出中','紛失')),
  -- 移行元（Excel）の値。照合の手がかりとして残す。金額計算には使わない
  import_name   text,
  import_maker  text,
  import_price  numeric(12,2),
  match_status  text not null default 'unmatched'
                  check (match_status in ('matched','needs_review','unmatched','manual','no_product')),
  match_note    text,
  note          text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint demo_shafts_no_uniq unique (company_id, demo_no)
);
create index if not exists demo_shafts_product_idx on golfwing.demo_shafts(company_id, product_id);
create index if not exists demo_shafts_shelf_idx   on golfwing.demo_shafts(company_id, shelf);
create index if not exists demo_shafts_match_idx   on golfwing.demo_shafts(company_id, match_status);

comment on table  golfwing.demo_shafts is '試打シャフト台帳。試打NOと商品マスタの紐づけ＋棚番号。定価は持たない';
comment on column golfwing.demo_shafts.demo_no is 'ラックのバーコード番号。絶対に振り直さない';
comment on column golfwing.demo_shafts.import_price is 'Excel移行時の定価。突き合わせ用の記録で、見積には使わない';

-- ---------------------------------------------------------------------
-- 2. 工賃マスタ
-- ---------------------------------------------------------------------
create table if not exists golfwing.labor_rates (
  id                 bigserial primary key,
  company_id         uuid not null default app.current_company_id(),
  code               text not null,
  name               text not null,
  price              numeric(12,2),          -- 通常（商品購入あり）
  price_bring_in     numeric(12,2),          -- フィッティング時持ち込み
  price_no_purchase  numeric(12,2),          -- 購入なし持ち込み
  unit               text not null default '本',
  quote_section      text not null default '工賃'
                       check (quote_section in ('工賃','加工部品')),
  price_note         text,                   -- 「1,000〜要相談」など
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint labor_rates_code_uniq unique (company_id, code)
);
comment on table golfwing.labor_rates is '工賃マスタ。見積の工賃行はここから出す（旧・隠しシート「見積のルール」の表）';

-- ---------------------------------------------------------------------
-- 3. 割引ルール（掛け率で持つ。0.80 = 20%OFF）
-- ---------------------------------------------------------------------
create table if not exists golfwing.discount_rules (
  id             bigserial primary key,
  company_id     uuid not null default app.current_company_id(),
  item_category  text not null,          -- 'シャフト' 'クラブ' 'グリップ' 'ボール' '*' など
  manufacturer   text,                   -- null = そのカテゴリの既定
  segment        text                    -- シャフトの3区分
                   check (segment is null or segment in
                     ('visitor_or_intro','member_paid_fitting','from_demo_or_lesson')),
  member_kind    text                    -- クラブ・グリップ等の2区分
                   check (member_kind is null or member_kind in ('会員','ビジター')),
  rate           numeric(5,4) not null check (rate > 0 and rate <= 1),
  priority       integer not null default 0,   -- 大きいほど優先（メーカー指定 > 既定）
  note           text,
  effective_from date not null default current_date,
  effective_to   date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists discount_rules_lookup_idx
  on golfwing.discount_rules(company_id, item_category, is_active);

comment on table golfwing.discount_rules is
  '割引ルール。掛け率で持つ（0.80=20%OFF）。シャフトは segment、クラブ・グリップ等は member_kind で引く。適用は @yozan/core/fitting-quote';

-- ---------------------------------------------------------------------
-- 4. 見積
-- ---------------------------------------------------------------------
create table if not exists golfwing.quotes (
  id                bigserial primary key,
  company_id        uuid not null default app.current_company_id(),
  store_id          uuid references public.stores(id),
  quote_seq         integer not null,
  quote_no          text not null,                       -- Q-0001
  -- お客様
  guest_id          uuid references public.mbr_guests(id),
  customer_name     text not null,
  customer_contact  text,                                -- ご連絡先
  member_kind       text not null default 'ビジター'
                      check (member_kind in ('会員','ビジター')),
  segment           text not null default 'visitor_or_intro'
                      check (segment in ('visitor_or_intro','member_paid_fitting','from_demo_or_lesson')),
  -- フィッティング（表紙）
  walkin_visit_id   uuid references public.mbr_walkin_visits(id),
  res_request_id    uuid references public.res_requests(id),
  fitting_date      date,
  fitter_staff_id   uuid references public.staff(id),
  fitter_name       text,
  fitting_menu      text,                                -- シャフトフルフィッティング／シャフトフィッティング／ボールフィッティング
  fitting_minutes   integer check (fitting_minutes is null or fitting_minutes in (55,110)),
  -- 見積のヘッダ
  quote_date        date not null default (now() at time zone 'Asia/Tokyo')::date,
  subject           text not null default '商品ご購入の件',
  delivery_note     text not null default '別途ご相談',
  payment_terms     text not null default '商品お渡し時',
  validity_note     text not null default '御見積後2週間',
  staff_name        text,                                -- 担当
  -- 金額
  tax_rate          numeric(5,4) not null default 0.10,
  tax_free_amount   numeric(12,2) not null default 0,    -- 税別品
  prepaid_amount    numeric(12,2) not null default 0,    -- 前受金
  refund_amount     numeric(12,2) not null default 0,    -- フィッティング料返金
  refund_auto       boolean not null default true,
  refund_note       text,
  -- 運用
  status            text not null default 'draft'
                      check (status in ('draft','reviewed','presented','accepted','ordered','void')),
  reviewed_by       uuid references public.staff(id),
  reviewed_at       timestamptz,
  approved_by       uuid references public.staff(id),    -- 特別割引の事前承認
  approved_at       timestamptz,
  note              text,                                -- 備考
  created_by        uuid references public.staff(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint quotes_seq_uniq unique (company_id, quote_seq)
);
create index if not exists quotes_guest_idx  on golfwing.quotes(company_id, guest_id);
create index if not exists quotes_date_idx   on golfwing.quotes(company_id, quote_date desc);
create index if not exists quotes_status_idx on golfwing.quotes(company_id, status);

comment on column golfwing.quotes.refund_amount is 'フィッティング料返金（購入時割引）。@yozan/core が本数から計算し、上限で丸めた結果';

-- ---------------------------------------------------------------------
-- 5. 見積明細
-- ---------------------------------------------------------------------
create table if not exists golfwing.quote_items (
  id               bigserial primary key,
  company_id       uuid not null default app.current_company_id(),
  quote_id         bigint not null references golfwing.quotes(id) on delete cascade,
  line_no          integer not null,
  line_kind        text not null default 'product'
                     check (line_kind in ('product','sleeve','coating','grip','labor','free')),
  -- 出所
  demo_no          integer,                                  -- 試打NO（試打から選んだとき）
  product_id       bigint references golfwing.products(id),
  labor_rate_id    bigint references golfwing.labor_rates(id),
  -- 見積時点で固定する値（あとでマスタが動いても見積は動かない）
  item_category    text,
  manufacturer     text,
  product_name     text not null,
  spec             text,
  club_type        text,                                     -- DR/FW/UT（返金計算に使う）
  list_price       numeric(12,2) not null default 0,
  discount_rate    numeric(5,4),                             -- 適用した掛け率
  discount_amount  numeric(12,2) not null default 0,         -- 値引額（負の数）
  unit_price       numeric(12,2) not null default 0,         -- 定価＋値引額
  quantity         integer not null default 1 check (quantity > 0),
  amount           numeric(12,2) not null default 0,
  tax_free         boolean not null default false,
  finish_length_inch numeric(6,3),                           -- 仕上げ長さ
  -- 手動で割引を変えたときの足跡
  discount_manual  boolean not null default false,
  discount_reason  text,
  discount_by      uuid references public.staff(id),
  discount_at      timestamptz,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint quote_items_line_uniq unique (quote_id, line_no)
);
create index if not exists quote_items_quote_idx   on golfwing.quote_items(quote_id);
create index if not exists quote_items_product_idx on golfwing.quote_items(company_id, product_id);

comment on column golfwing.quote_items.list_price is
  '見積を作った時点の定価を写し取る。あとで商品マスタが値上げされても、出した見積の金額は動かさない';

-- ---------------------------------------------------------------------
-- 6. 注文書（＝工房の1件）
-- ---------------------------------------------------------------------
create table if not exists golfwing.work_orders (
  id                 bigserial primary key,
  company_id         uuid not null default app.current_company_id(),
  store_id           uuid references public.stores(id),
  quote_id           bigint not null references golfwing.quotes(id),
  order_seq          integer not null,
  order_no           text not null,                       -- W-0001
  order_date         date not null default (now() at time zone 'Asia/Tokyo')::date,
  due_date           date,                                -- 仕上げ期日
  -- 紙の注文書 最終行の進捗
  ordered_on         date,      -- 発注
  arrived_on         date,      -- 到着（入荷登録から自動で立つ）
  assembled_on       date,      -- 組立
  reve_sent_on       date,      -- REVE送信
  delivered_on       date,      -- お渡し
  td_on              date,      -- TD
  paid_on            date,      -- お支払い
  assembled_by       uuid references public.staff(id),
  assembled_by_name  text,      -- 組立担当（スタッフ未登録でも書ける）
  -- REVE のシャフト情報
  reve_color         text,
  reve_serial        text,
  -- 連携
  purchase_order_id  bigint references golfwing.purchase_orders(id),
  sales_posted_at    timestamptz,                         -- mon_sales_lines へ計上した時刻
  status             text not null default 'open'
                       check (status in ('open','ordered','arrived','assembling','ready','delivered','closed','void')),
  note               text,
  created_by         uuid references public.staff(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint work_orders_quote_uniq unique (quote_id),
  constraint work_orders_seq_uniq   unique (company_id, order_seq)
);
create index if not exists work_orders_status_idx on golfwing.work_orders(company_id, status);
create index if not exists work_orders_due_idx    on golfwing.work_orders(company_id, due_date);
create index if not exists work_orders_po_idx     on golfwing.work_orders(company_id, purchase_order_id);

-- ---------------------------------------------------------------------
-- 7. 組立仕様（クラブ1本 = 1行）＝ 紙の工房指示書
--    目標は「範囲」、実測は別列。両方残す
-- ---------------------------------------------------------------------
create table if not exists golfwing.work_order_specs (
  id                bigserial primary key,
  company_id        uuid not null default app.current_company_id(),
  work_order_id     bigint not null references golfwing.work_orders(id) on delete cascade,
  line_no           integer not null,
  priority          integer,                              -- 優先順位（紙の左端の列）
  quote_item_id     bigint references golfwing.quote_items(id),
  -- ヘッド
  head_product_id   bigint references golfwing.products(id),
  head_name         text,                                 -- 装着ヘッド（持ち込みも書ける）
  -- 目標（範囲）
  cpm_min           numeric(6,1),   cpm_max      numeric(6,1),
  balance_min       text,           balance_max  text,    -- D2 など文字で持つ
  length_min        numeric(6,3),   length_max   numeric(6,3),   -- inch
  weight_min        numeric(7,2),   weight_max   numeric(7,2),   -- g（総重量）
  head_weight       numeric(7,2),                                -- g
  -- 選択項目
  screw             text check (screw is null or screw in ('有り','無し')),
  grip_layers       text check (grip_layers is null or grip_layers in ('1重','2重')),
  grip_wrap         text check (grip_wrap is null or grip_wrap in ('螺旋','縦')),
  sleeve_source     text check (sleeve_source is null or sleeve_source in ('再利用','購入','他')),
  sleeve_position   text,
  spec_note         text,                                 -- 備考
  -- 実測（組み上がり）
  actual_cpm         numeric(6,1),
  actual_balance     text,
  actual_length      numeric(6,3),
  actual_weight      numeric(7,2),
  actual_head_weight numeric(7,2),
  actual_note        text,
  measured_at        timestamptz,
  measured_by        uuid references public.staff(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint work_order_specs_line_uniq unique (work_order_id, line_no)
);
create index if not exists work_order_specs_wo_idx on golfwing.work_order_specs(work_order_id);

comment on table golfwing.work_order_specs is
  '工房の組立指示書。目標は範囲（cpm_min〜cpm_max 等）、組み上がりは actual_* に入れる。次回来店時に「前回の仕上がり」を出すための資産';
comment on column golfwing.work_order_specs.priority is
  '優先順位。振動数・バランス・長さ・総重量が同時に満たせないとき、何を優先するかという工房の判断そのもの';

-- ---------------------------------------------------------------------
-- 8. 採番（一意索引を最後の砦にする）
-- ---------------------------------------------------------------------
create or replace function golfwing.next_quote_seq(p_company uuid)
returns integer language sql security definer set search_path = golfwing, public as $fn$
  select coalesce(max(quote_seq), 0) + 1 from golfwing.quotes where company_id = p_company;
$fn$;

create or replace function golfwing.next_work_order_seq(p_company uuid)
returns integer language sql security definer set search_path = golfwing, public as $fn$
  select coalesce(max(order_seq), 0) + 1 from golfwing.work_orders where company_id = p_company;
$fn$;

revoke execute on function golfwing.next_quote_seq(uuid) from public;
revoke execute on function golfwing.next_work_order_seq(uuid) from public;
grant  execute on function golfwing.next_quote_seq(uuid) to authenticated, service_role;
grant  execute on function golfwing.next_work_order_seq(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9. RLS（既存の golfwing テーブルと同じ形）
-- ---------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['demo_shafts','labor_rates','discount_rules','quotes','quote_items','work_orders','work_order_specs']
  loop
    execute format('alter table golfwing.%I enable row level security', t);
    execute format('revoke all on golfwing.%I from anon', t);
    execute format('grant select, insert, update, delete on golfwing.%I to authenticated', t);
    execute format('grant all on golfwing.%I to service_role', t);
    execute format($f$create policy tenant_select on golfwing.%I for select to authenticated
                      using (company_id = app.current_company_id())$f$, t);
    execute format($f$create policy tenant_insert on golfwing.%I for insert to authenticated
                      with check (company_id = app.current_company_id())$f$, t);
    execute format($f$create policy tenant_update on golfwing.%I for update to authenticated
                      using (company_id = app.current_company_id())$f$, t);
    execute format($f$create policy tenant_delete on golfwing.%I for delete to authenticated
                      using (company_id = app.current_company_id())$f$, t);
  end loop;
end $do$;

do $do$
declare s text;
begin
  foreach s in array array['demo_shafts_id_seq','labor_rates_id_seq','discount_rules_id_seq',
                           'quotes_id_seq','quote_items_id_seq','work_orders_id_seq','work_order_specs_id_seq']
  loop
    execute format('grant usage, select on sequence golfwing.%I to authenticated, service_role', s);
  end loop;
end $do$;
