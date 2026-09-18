-- 0192: craft-os から作った発注にもメール下書き（件名・本文）を入れる
-- ユーザー報告（2026-09-19）: craft-os の【発注する】で開いた発注管理のオーダー用紙に
--   「テンプレートがまだ作成されていません」と出る。
-- 原因: gw_create_purchase_drafts が golfwing.purchase_orders に直接 INSERT していて、
--   発注管理アプリが発注作成時に作るメール下書き（email_subject / email_body）を作っていなかった。
-- 対処: 発注管理の composeMail（apps/golfwing/src/routes/api.ts）と同じ文面を SQL で作る関数を足し、
--   発注を作った直後に呼ぶ。発注メモ（order_note＝「craft-os 26-0003 より自動作成」）は社内用なのでメールには載せない。

create or replace function public.gw_compose_po_mail(p_po bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'golfwing'
as $$
declare
  v_sup   golfwing.suppliers%rowtype;
  v_lines text;
begin
  select s.* into v_sup
    from golfwing.purchase_orders po
    join golfwing.suppliers s on s.id = po.supplier_id
   where po.id = p_po;
  if not found then return; end if;

  select string_agg(
           '・' || coalesce(i.item_category, '') || ' / ' || coalesce(i.manufacturer, '') || ' / ' || coalesce(i.product_name, '')
           || case when coalesce(i.spec, '') <> '' then ' / ' || i.spec else '' end
           || case when coalesce(i.color, '') <> '' then ' / ' || i.color else '' end
           || case when coalesce(i.club_type, '') <> '' then ' / ' || i.club_type else '' end
           || ' / ' || i.quantity::text || coalesce(nullif(i.unit, ''), '本'),
           E'\n' order by i.id)
    into v_lines
    from golfwing.purchase_order_items i
   where i.purchase_order_id = p_po;

  update golfwing.purchase_orders
     set email_subject = '発注のお願い',
         email_body = v_sup.name || E'\n'
           || coalesce(nullif(v_sup.contact_name, ''), 'ご担当者') || coalesce(nullif(v_sup.honorific, ''), '様') || E'\n\n'
           || E'お世話になっております。\n\n下記の通り、発注をお願いいたします。\n\n'
           || coalesce(v_lines, '') || E'\n\nご確認のほど、よろしくお願いいたします。\n'
   where id = p_po;
end;
$$;

revoke all on function public.gw_compose_po_mail(bigint) from public, anon, authenticated;
grant execute on function public.gw_compose_po_mail(bigint) to service_role;

-- gw_create_purchase_drafts: 発注を作った直後にメール下書きを入れる（中身は 0172〜0174 のまま、perform を1行足しただけ）
create or replace function public.gw_create_purchase_drafts(p_company uuid, p_quote_id bigint, p_ordered_by text default null::text)
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

    -- 0192: 発注管理のオーダー用紙に「テンプレートがまだ作成されていません」と出ないよう、メール下書きを入れる
    perform public.gw_compose_po_mail(v_po);

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
$function$;

-- ついでに: この関数は SECURITY DEFINER で、どの会社の発注でも作れる。anon / authenticated から呼べる状態だったので閉じる
-- （craft-os はサーバー側の service_role からしか呼ばない）
revoke all on function public.gw_create_purchase_drafts(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.gw_create_purchase_drafts(uuid, bigint, text) to service_role;

-- すでに作ってしまった craft-os の発注（本文が空のもの）に下書きを入れる
do $$
declare r record;
begin
  for r in select id from golfwing.purchase_orders
            where order_note like 'craft-os %' and coalesce(email_body, '') = ''
  loop
    perform public.gw_compose_po_mail(r.id);
  end loop;
end $$;
