-- 0196 craft-os【発注する】で明細が抜ける不具合の修正（2026-09-20）
--
-- 症状: 4本注文（3行）なのに発注管理のオーダー用紙には1本しか載らなかった（見積 26-0011）。
-- 原因: 商品マスタから選ばず「手入力」した行（line_kind='free'）を、発注の対象からも
--       「載せられなかった一覧」からも外していた＝黙って消えていた。
--       さらに、1度でも発注ができると押し直しても何も足さない作りだった。
-- 修正:
--  1. 手入力の行も発注に載せる。仕入先は「同じメーカーの商品で一番多い仕入先」。
--     行の備考に「手入力（商品マスタ未登録）」と入れ、単価は空（発注管理で確認）。
--  2. purchase_order_items.craft_quote_item_id で「どの明細を発注済みか」を持つ。
--     【発注する】は何度押しても、まだ載っていない明細だけを足す（二重発注しない）。
--     同じ仕入先の発注がまだ「プール」ならそこへ足し、送信済みなら新しい発注を作る。
--  3. 仕入先がどうしても決まらない行だけを skipped に返す（画面に出る）。

alter table golfwing.purchase_order_items
  add column if not exists craft_quote_item_id bigint;
create index if not exists idx_poi_craft_quote_item on golfwing.purchase_order_items (craft_quote_item_id)
  where craft_quote_item_id is not null;
comment on column golfwing.purchase_order_items.craft_quote_item_id is 'craft-os の見積明細（gw_quote_items.id）。どの明細を発注済みかの印';

-- 既存の craft-os 発注に印を付ける（同じ伝票・同じ商品）
update golfwing.purchase_order_items poi
   set craft_quote_item_id = qi.id
  from public.gw_work_order_pos wp
  join public.gw_work_orders w on w.id = wp.work_order_id
  join public.gw_quote_items qi on qi.quote_id = w.quote_id
 where poi.purchase_order_id = wp.purchase_order_id
   and poi.craft_quote_item_id is null
   and qi.product_id is not null
   and poi.product_id = qi.product_id;

create or replace function public.gw_create_purchase_drafts(p_company uuid, p_quote_id bigint, p_ordered_by text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'golfwing'
as $function$
declare
  v_quote    public.gw_quotes%rowtype;
  v_work_id  bigint;
  v_due      date;
  v_batch    text;
  v_today    date := (now() at time zone 'Asia/Tokyo')::date;
  v_po       bigint;
  v_created  int := 0;
  v_added    int := 0;
  v_orders   jsonb := '[]'::jsonb;
  v_skipped  jsonb := '[]'::jsonb;
  r          record;
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

  -- まだ発注に載っていない明細と、その仕入先
  create temp table if not exists _craft_po_lines (
    qi_id bigint, supplier_id bigint, product_id bigint, item_category text, manufacturer text,
    product_name text, spec text, club_type text, quantity int, list_price numeric, rate numeric,
    unit text, line_note text
  ) on commit drop;
  truncate _craft_po_lines;

  insert into _craft_po_lines
  select qi.id,
         coalesce(p.default_supplier_id, ms.supplier_id),
         p.id,
         coalesce(qi.item_category, 'その他'), qi.manufacturer, qi.product_name, qi.spec, qi.club_type,
         qi.quantity,
         coalesce(p.list_price, qi.list_price),
         p.default_rate,
         coalesce(p.unit, '本'),
         nullif(concat_ws(' / ',
           case when p.id is null then '手入力（商品マスタ未登録）' end,
           case when qi.finish_length_inch is not null then '仕上げ ' || qi.finish_length_inch || 'inch' end), '')
    from public.gw_quote_items qi
    left join golfwing.products p on p.id = qi.product_id
    left join lateral (
      -- 手入力の行・仕入先未設定の商品は「同じメーカーで一番多い仕入先」
      select p2.default_supplier_id as supplier_id
        from golfwing.products p2
       where qi.manufacturer is not null
         and p2.manufacturer = qi.manufacturer
         and p2.default_supplier_id is not null
       group by p2.default_supplier_id
       order by count(*) desc
       limit 1
    ) ms on true
   where qi.quote_id = p_quote_id
     and qi.line_kind in ('product','grip','sleeve','coating','free')
     and not exists (
       select 1 from golfwing.purchase_order_items x
        where x.craft_quote_item_id = qi.id
     );

  for r in select * from _craft_po_lines where supplier_id is null loop
    v_skipped := v_skipped || jsonb_build_object(
      'product_name', r.product_name,
      'manufacturer', r.manufacturer,
      'reason', case when r.manufacturer is null then 'メーカーが空欄のため仕入先が決められない'
                     else 'このメーカーの仕入先が商品マスタに無い' end);
  end loop;

  for r in
    select l.supplier_id, s.name as supplier_name
      from _craft_po_lines l
      join golfwing.suppliers s on s.id = l.supplier_id
     group by 1, 2
     order by 2
  loop
    -- 同じ伝票・同じ仕入先の「プール」（まだ送っていない）発注があればそこへ足す
    v_po := null;
    if v_work_id is not null then
      select po.id into v_po
        from public.gw_work_order_pos wp
        join golfwing.purchase_orders po on po.id = wp.purchase_order_id
       where wp.work_order_id = v_work_id
         and po.supplier_id = r.supplier_id
         and po.status = 'pool'
       order by po.id
       limit 1;
    end if;

    if v_po is null then
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
      v_created := v_created + 1;
      if v_work_id is not null then
        insert into public.gw_work_order_pos (company_id, work_order_id, purchase_order_id)
        values (p_company, v_work_id, v_po)
        on conflict do nothing;
      end if;
    end if;

    insert into golfwing.purchase_order_items
      (company_id, purchase_order_id, product_id, item_category, manufacturer, product_name,
       spec, club_type, quantity, list_price, rate, unit_price, amount,
       customer_name, usage_type, requested_delivery_date, unit, line_note, craft_quote_item_id)
    select p_company, v_po, l.product_id, l.item_category, l.manufacturer, l.product_name,
           l.spec, l.club_type, l.quantity, l.list_price, l.rate,
           case when l.rate is null or l.list_price is null then null else floor(l.list_price * l.rate) end,
           case when l.rate is null or l.list_price is null then null else floor(l.list_price * l.rate) * l.quantity end,
           v_quote.customer_name, '取り寄せ', v_due, l.unit, l.line_note, l.qi_id
      from _craft_po_lines l
     where l.supplier_id = r.supplier_id
     order by l.qi_id;
    get diagnostics v_added = row_count;

    perform public.gw_compose_po_mail(v_po);
    v_orders := v_orders || jsonb_build_object('purchase_order_id', v_po, 'supplier', r.supplier_name, 'added', v_added);
  end loop;

  return jsonb_build_object('created', v_created, 'batch_code', v_batch, 'orders', v_orders, 'skipped', v_skipped);
end;
$function$;

revoke all on function public.gw_create_purchase_drafts(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.gw_create_purchase_drafts(uuid, bigint, text) to service_role;

-- 注文書の画面で「まだ発注に載っていない明細」が何行あるか（あれば【抜けている明細を発注に足す】を出す）
create or replace function public.gw_unordered_quote_item_count(p_company uuid, p_quote_id bigint)
returns int
language sql
stable
security definer
set search_path to 'public', 'golfwing'
as $$
  select count(*)::int
    from public.gw_quote_items qi
   where qi.company_id = p_company
     and qi.quote_id = p_quote_id
     and qi.line_kind in ('product','grip','sleeve','coating','free')
     and not exists (select 1 from golfwing.purchase_order_items x where x.craft_quote_item_id = qi.id);
$$;
revoke all on function public.gw_unordered_quote_item_count(uuid, bigint) from public, anon, authenticated;
grant execute on function public.gw_unordered_quote_item_count(uuid, bigint) to service_role;
