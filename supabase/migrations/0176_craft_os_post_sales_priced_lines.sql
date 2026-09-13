-- 0176_craft_os_post_sales_priced_lines.sql
-- 売上計上が 0円 で入ってしまうのを直す。（2026-09-13 適用済み）
--
-- gw_quote_items の unit_price / amount / discount_amount は誰も書いていない（ずっと 0）。
-- 金額の正典は @yozan/core/fitting-quote で、画面はその都度計算して表示している。
-- 0173 の gw_post_sales は DB の amount を読んでいたので、計上すると 0円 で入る。
--
-- 直し方: 金額は呼ぶ側（TypeScript の正典）で計算して p_lines で渡す。
--   SQL側に割引の式を書き写すと正典が2つになるので、それはしない。
-- 返金額は gw_quotes.refund_amount（保存時に書かれている）をそのまま使う。
--
-- 検証: 定価50,000・30%OFF・返金16,500 で通し、
--       売上 35,000（税込38,500）＋返金 -15,000（税込-16,500）＝18,500 で一致。

drop function if exists public.gw_post_sales(uuid, bigint, uuid);

create or replace function public.gw_post_sales(
  p_company  uuid,
  p_quote_id bigint,
  p_staff    uuid,
  p_lines    jsonb
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
  v_item_id  bigint;
  r          jsonb;
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

  for r in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    v_item_id := (r->>'quote_item_id')::bigint;

    -- 同じ明細を2回計上しない
    if exists (select 1 from public.gw_sales_postings sp
                where sp.quote_item_id = v_item_id and sp.line_kind = 'item') then
      continue;
    end if;

    insert into public.mon_sales_lines
      (company_id, store_id, segment_id, sold_on, customer_name, member_kind,
       item_category, item_type, maker, product_name,
       list_price, discount, sale_price, qty, amount, tax_included, memo, source)
    values
      (p_company, v_quote.store_id, v_segment, v_sold_on, v_quote.customer_name, v_quote.member_kind,
       coalesce(r->>'item_category', 'その他'), r->>'line_kind', r->>'maker', r->>'product_name',
       (r->>'list_price')::numeric, (r->>'discount')::numeric, (r->>'sale_price')::numeric,
       (r->>'qty')::numeric, (r->>'amount')::numeric,
       floor((r->>'amount')::numeric * (1 + v_quote.tax_rate)),
       'craft-os ' || v_quote.quote_no, 'craft-os')
    returning id into v_line;

    insert into public.gw_sales_postings
      (company_id, quote_id, quote_item_id, line_kind, sales_line_id, amount, posted_by)
    values (p_company, p_quote_id, v_item_id, 'item', v_line, (r->>'amount')::numeric, p_staff);

    v_posted := v_posted + 1;
    v_amount := v_amount + (r->>'amount')::numeric;
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

grant execute on function public.gw_post_sales(uuid, bigint, uuid, jsonb) to authenticated, service_role;

comment on function public.gw_post_sales(uuid, bigint, uuid, jsonb) is
  'craft-os: 伝票の明細を mon_sales_lines へ計上する。金額は呼ぶ側（@yozan/core/fitting-quote）で計算したものを p_lines で受け取る。二重計上は gw_sales_postings で防ぐ';

comment on column public.gw_quote_items.amount is
  '⚠ 使っていない。金額の正典は @yozan/core/fitting-quote で、画面と帳票はその都度計算する';
comment on column public.gw_quote_items.unit_price is
  '⚠ 使っていない。金額の正典は @yozan/core/fitting-quote';
comment on column public.gw_quote_items.discount_amount is
  '⚠ 手入力の値引き額を入れる欄。自動計算の値引き額はここには入らない（正典は fitting-quote）';
