-- 0173_craft_os_purchase_and_sales_rpc.sql
-- craft-os から発注管理・Money OS へつなぐ2つの関数。（2026-09-13 適用済み）
--
-- golfwing スキーマは PostgREST に出ていない（craft-os から直接 insert できない）ため、
-- public に SECURITY DEFINER の関数を置いて、そこ経由で書く。
-- 「発注書を作る」「売上を計上する」という業務の単位で1関数＝呼ぶ側に手順を持たせない。

-- ── 1. 工房の作業から、仕入先ごとの発注下書き（プール）を作る ───────────
create or replace function public.gw_create_purchase_drafts(
  p_company     uuid,
  p_quote_id    bigint,
  p_ordered_by  text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','golfwing'
as $fn$
declare
  v_quote    public.gw_quotes%rowtype;
  v_work_id  bigint;
  v_due      date;
  v_batch    text;
  v_today    date := (now() at time zone 'Asia/Tokyo')::date;
  v_po       bigint;
  v_created  int := 0;
  v_orders   jsonb := '[]'::jsonb;
  v_skipped  jsonb := '[]'::jsonb;
  r          record;
  i          record;
begin
  select * into v_quote from public.gw_quotes
   where id = p_quote_id and company_id = p_company and deleted_at is null;
  if not found then
    return jsonb_build_object('error', '伝票が見つかりません');
  end if;

  select id, due_date into v_work_id, v_due from public.gw_work_orders
   where quote_id = p_quote_id and company_id = p_company and deleted_at is null;

  v_batch := to_char(now() at time zone 'Asia/Tokyo', 'YYYYMMDDHH24MISS')
             || '-craft' || lpad((floor(random()*10000))::int::text, 4, '0');

  -- 仕入先が決まっていない明細は発注に出せない（人が仕入先を決める必要がある）
  for i in
    select qi.product_name, qi.manufacturer
    from public.gw_quote_items qi
    left join golfwing.products p on p.id = qi.product_id
    where qi.quote_id = p_quote_id
      and qi.line_kind in ('product','grip','sleeve','coating')
      and (qi.product_id is null or p.default_supplier_id is null)
  loop
    v_skipped := v_skipped || jsonb_build_object(
      'product_name', i.product_name,
      'manufacturer', i.manufacturer,
      'reason', case when i.manufacturer is null then '商品マスタに無い手入力行' else '商品マスタに仕入先が設定されていない' end);
  end loop;

  for r in
    select p.default_supplier_id as supplier_id, s.name as supplier_name
    from public.gw_quote_items qi
    join golfwing.products  p on p.id = qi.product_id
    join golfwing.suppliers s on s.id = p.default_supplier_id
    where qi.quote_id = p_quote_id
      and qi.line_kind in ('product','grip','sleeve','coating')
    group by 1, 2
    order by 2
  loop
    insert into golfwing.purchase_orders
      (company_id, batch_code, order_no, order_date, ordered_by, supplier_id,
       customer_name, usage_type, requested_delivery_date, status, order_note)
    values
      (p_company, v_batch,
       'PO-' || to_char(v_today, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5)),
       v_today, p_ordered_by, r.supplier_id,
       v_quote.customer_name, '取り寄せ', v_due, 'pool',
       'craft-os ' || v_quote.quote_no || ' より自動作成')
    returning id into v_po;

    insert into golfwing.purchase_order_items
      (company_id, purchase_order_id, product_id, item_category, manufacturer, product_name,
       spec, club_type, quantity, list_price, rate, unit_price, amount,
       customer_name, usage_type, requested_delivery_date, unit, line_note)
    select p_company, v_po, qi.product_id,
           coalesce(qi.item_category, 'その他'), qi.manufacturer, qi.product_name,
           qi.spec, qi.club_type, qi.quantity, p.list_price, p.default_rate,
           case when p.default_rate is null then null else floor(p.list_price * p.default_rate) end,
           case when p.default_rate is null then null else floor(p.list_price * p.default_rate) * qi.quantity end,
           v_quote.customer_name, '取り寄せ', v_due, coalesce(p.unit, '本'),
           case when qi.finish_length_inch is null then null
                else '仕上げ ' || qi.finish_length_inch || 'inch' end
    from public.gw_quote_items qi
    join golfwing.products p on p.id = qi.product_id
    where qi.quote_id = p_quote_id
      and qi.line_kind in ('product','grip','sleeve','coating')
      and p.default_supplier_id = r.supplier_id;

    if v_work_id is not null then
      insert into public.gw_work_order_pos (company_id, work_order_id, purchase_order_id)
      values (p_company, v_work_id, v_po)
      on conflict do nothing;
    end if;

    v_created := v_created + 1;
    v_orders := v_orders || jsonb_build_object('purchase_order_id', v_po, 'supplier', r.supplier_name);
  end loop;

  return jsonb_build_object('created', v_created, 'batch_code', v_batch, 'orders', v_orders, 'skipped', v_skipped);
end;
$fn$;

-- ── 2. 売上を Money OS（mon_sales_lines）へ計上する ───────────────────
create or replace function public.gw_post_sales(
  p_company  uuid,
  p_quote_id bigint,
  p_staff    uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_quote    public.gw_quotes%rowtype;
  v_segment  uuid;
  v_sold_on  date;
  v_posted   int := 0;
  v_amount   numeric := 0;
  v_line     uuid;
  qi         record;
  v_refund   numeric;
begin
  select * into v_quote from public.gw_quotes
   where id = p_quote_id and company_id = p_company and deleted_at is null;
  if not found then
    return jsonb_build_object('error', '伝票が見つかりません');
  end if;

  -- 売上日は「お渡し日 → お支払い日 → 伝票日」の順で決める
  select coalesce(w.delivered_on, w.paid_on, v_quote.quote_date) into v_sold_on
    from public.gw_work_orders w
   where w.quote_id = p_quote_id and w.company_id = p_company and w.deleted_at is null;
  v_sold_on := coalesce(v_sold_on, v_quote.quote_date);

  select id into v_segment from public.fin_segments
   where company_id = p_company and name like 'ゴルフ事業%' limit 1;

  for qi in
    select * from public.gw_quote_items
     where quote_id = p_quote_id and company_id = p_company
       and not exists (select 1 from public.gw_sales_postings sp
                        where sp.quote_item_id = gw_quote_items.id and sp.line_kind = 'item')
     order by line_no
  loop
    insert into public.mon_sales_lines
      (company_id, store_id, segment_id, sold_on, customer_name, member_kind,
       item_category, item_type, maker, product_name,
       list_price, discount, sale_price, qty, amount, tax_included, memo, source)
    values
      (p_company, v_quote.store_id, v_segment, v_sold_on, v_quote.customer_name, v_quote.member_kind,
       coalesce(qi.item_category, 'その他'), qi.line_kind, qi.manufacturer, qi.product_name,
       qi.list_price, qi.discount_amount,
       case when qi.quantity > 0 then floor(qi.amount / qi.quantity) else qi.amount end,
       qi.quantity, qi.amount, floor(qi.amount * (1 + v_quote.tax_rate)),
       'craft-os ' || v_quote.quote_no, 'craft-os')
    returning id into v_line;

    insert into public.gw_sales_postings
      (company_id, quote_id, quote_item_id, line_kind, sales_line_id, amount, posted_by)
    values (p_company, p_quote_id, qi.id, 'item', v_line, qi.amount, p_staff);

    v_posted := v_posted + 1;
    v_amount := v_amount + qi.amount;
  end loop;

  -- フィッティング料の返金は値引きなので、マイナスの行で落とす（PLを膨らませない）
  v_refund := coalesce(v_quote.refund_amount, 0);
  if v_refund > 0 and not exists (
      select 1 from public.gw_sales_postings
       where quote_id = p_quote_id and line_kind = 'refund') then
    insert into public.mon_sales_lines
      (company_id, store_id, segment_id, sold_on, customer_name, member_kind,
       item_category, item_type, product_name, qty, amount, tax_included, memo, source)
    values
      (p_company, v_quote.store_id, v_segment, v_sold_on, v_quote.customer_name, v_quote.member_kind,
       'フィッティング料返金', 'refund', 'フィッティング料のご返金', 1,
       -floor(v_refund / (1 + v_quote.tax_rate)), -v_refund,
       'craft-os ' || v_quote.quote_no, 'craft-os')
    returning id into v_line;

    insert into public.gw_sales_postings
      (company_id, quote_id, quote_item_id, line_kind, sales_line_id, amount, posted_by)
    values (p_company, p_quote_id, null, 'refund', v_line, -v_refund, p_staff);
    v_posted := v_posted + 1;
    v_amount := v_amount - v_refund;
  end if;

  return jsonb_build_object('posted', v_posted, 'amount', v_amount, 'sold_on', v_sold_on);
end;
$fn$;

grant execute on function public.gw_create_purchase_drafts(uuid, bigint, text) to authenticated, service_role;
grant execute on function public.gw_post_sales(uuid, bigint, uuid) to authenticated, service_role;

comment on function public.gw_create_purchase_drafts(uuid, bigint, text) is
  'craft-os: 伝票の明細から、仕入先ごとに発注管理の「発注プール」へ下書きを作る。仕入先未設定の行は skipped で返す';
comment on function public.gw_post_sales(uuid, bigint, uuid) is
  'craft-os: 伝票の明細を mon_sales_lines へ計上する。gw_sales_postings で二重計上を防ぐ';
