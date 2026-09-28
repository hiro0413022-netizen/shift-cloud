-- ============================================================
-- 0207: パーソナルレッスン手当を「Money OS の売上入力」からも数える（#286）
--
-- 背景（2026-09-28 ユーザー依頼「給料計算も修正。パーソナル件数も給料に入る。money-osと連携」）:
--   0094 の personal_lesson_counts は mon_sales_lines（Excelの売上台帳）だけを見ていた。
--   GOLF WING は 2026-08 から売上を Money OS の画面（mon_sales・source='app'）で入れるようになり、
--   台帳（lines）は 2026-07 で止まっている。
--   → 8月・9月のパーソナルが1件も手当に入っていなかった（8月給与は締め済みで personal 0件）。
--   さらに画面入力は「パーソナルレッスン２５分」（全角数字）なので、'%25分%' の条件にも合わなかった。
--
-- 解き方:
--   1. personal_lesson_source_rows(): 台帳（lines）と画面入力（mon_sales app）を同じ形で返す1か所。
--      ・商品名は全角数字・全角かっこを半角に直してから「パーソナルレッスン」「25分」で判定
--      ・担当は lines.pro / mon_sales.detail->>'pro'（末尾の「プロ」は外す）
--      ・件数は個数（qty）。返金（区分='返金' または金額マイナス）はマイナス
--      ・**二重計上の防止**: 同じ店舗・同じ月に台帳の行が1件でもあれば、その店舗・月は台帳だけを使う
--        （台帳が正典だった時代の数字を変えない／画面から書き出したExcelを後で取り込んでも二重にならない）
--   2. personal_lesson_counts / personal_lesson_unlinked_lines / sync_lesson_outsourcing_expense を
--      すべてこの関数を通すように作り直す（判定を1か所にする）。
--      unlinked_lines は「どちらの表の行か（source）」を返すよう列を足した（直す先が違うため）。
--   3. sync_lesson_outsourcing_expense の計上先の店舗・事業も同じ行から決める
--      （以前は台帳の行から決めていたので、台帳が無い月は外注費が計上されなかった）。
-- ============================================================

create or replace function personal_lesson_source_rows(p_company_id uuid, p_from date, p_to date)
returns table (
  source text,
  row_id uuid,
  store_id uuid,
  segment_id uuid,
  sold_on date,
  customer_name text,
  product_name text,
  item_category text,
  qty integer,
  amount integer,
  raw_pro text,
  memo text
)
language sql stable security definer set search_path = public as $$
  with lines as (
    select
      'line'::text as source,
      l.id as row_id,
      l.store_id,
      l.segment_id,
      l.sold_on,
      l.customer_name,
      l.product_name,
      l.item_category,
      (case when l.item_category = '返金' then -1 else 1 end * coalesce(l.qty, 1))::integer as qty,
      (case when l.item_category = '返金' then -abs(l.amount) else l.amount end)::integer as amount,
      nullif(regexp_replace(btrim(coalesce(l.pro, '')), 'プロ$', ''), '') as raw_pro,
      l.memo
    from mon_sales_lines l
    where l.company_id = p_company_id
      and l.deleted_at is null
      and l.sold_on between p_from and p_to
      and translate(coalesce(l.product_name, ''), '０１２３４５６７８９（）', '0123456789()') like '%パーソナルレッスン%'
      and translate(coalesce(l.product_name, ''), '０１２３４５６７８９（）', '0123456789()') like '%25分%'
  ),
  line_months as (
    select distinct lines.store_id, date_trunc('month', lines.sold_on) as m from lines
  ),
  sales as (
    select
      'sale'::text as source,
      s.id as row_id,
      s.store_id,
      s.segment_id,
      s.sold_on,
      s.customer_name,
      s.detail ->> 'product_name' as product_name,
      s.category as item_category,
      (case when s.category = '返金' or s.amount < 0 then -1 else 1 end
        * greatest(1, coalesce(nullif(s.detail ->> 'qty', '')::numeric, 1)))::integer as qty,
      s.amount::integer as amount,
      nullif(regexp_replace(btrim(coalesce(s.detail ->> 'pro', '')), 'プロ$', ''), '') as raw_pro,
      s.memo
    from mon_sales s
    where s.company_id = p_company_id
      and s.deleted_at is null
      and s.source = 'app'
      and s.sold_on between p_from and p_to
      and translate(coalesce(s.detail ->> 'product_name', ''), '０１２３４５６７８９（）', '0123456789()') like '%パーソナルレッスン%'
      and translate(coalesce(s.detail ->> 'product_name', ''), '０１２３４５６７８９（）', '0123456789()') like '%25分%'
      -- 同じ店舗・同じ月に台帳があればそちらが正典（二重計上しない）
      and not exists (
        select 1 from line_months lm
        where lm.store_id is not distinct from s.store_id
          and lm.m = date_trunc('month', s.sold_on)
      )
  )
  select * from lines
  union all
  select * from sales;
$$;

comment on function personal_lesson_source_rows(uuid, date, date) is
  'パーソナルレッスン（25分）の明細。売上台帳(mon_sales_lines)とMoney OSの売上入力(mon_sales app)を同じ形で返す。同じ店舗・月に台帳があれば台帳だけ（#286）';

create or replace function personal_lesson_counts(p_company_id uuid, p_from date, p_to date)
returns table (pro_name text, staff_id uuid, staff_name text, payout_mode text, qty integer, sales_amount integer)
language sql stable security definer set search_path = public as $$
  with matched as (
    select
      r.raw_pro,
      p.staff_id,
      coalesce(p.payout_mode, 'payroll') as payout_mode,
      r.qty,
      r.amount
    from personal_lesson_source_rows(p_company_id, p_from, p_to) r
    left join mon_pros p
      on p.deleted_at is null
     and p.company_id = p_company_id
     and (p.name = r.raw_pro or r.raw_pro = any(p.aliases))
  )
  select
    coalesce(m.raw_pro, '(未設定)') as pro_name,
    m.staff_id,
    s.name as staff_name,
    m.payout_mode,
    sum(m.qty)::integer as qty,
    sum(m.amount)::integer as sales_amount
  from matched m
  left join staff s on s.id = m.staff_id
  group by 1, 2, 3, 4
  having sum(m.qty) <> 0
  order by 5 desc;
$$;

-- 戻り値の列を足すので作り直し（source を追加）
drop function if exists personal_lesson_unlinked_lines(uuid, date, date);
create function personal_lesson_unlinked_lines(p_company_id uuid, p_from date, p_to date)
returns table (
  line_id uuid, store_id uuid, sold_on date, customer_name text, product_name text,
  item_category text, qty integer, amount integer, raw_pro text, memo text, source text
)
language sql stable security definer set search_path = public as $$
  select
    r.row_id as line_id,
    r.store_id,
    r.sold_on,
    r.customer_name,
    r.product_name,
    r.item_category,
    r.qty,
    r.amount,
    r.raw_pro,
    r.memo,
    r.source
  from personal_lesson_source_rows(p_company_id, p_from, p_to) r
  left join mon_pros p
    on p.deleted_at is null
   and p.company_id = p_company_id
   and (p.name = r.raw_pro or r.raw_pro = any(p.aliases))
  where p.staff_id is null
  order by r.sold_on, r.customer_name;
$$;

create or replace function sync_lesson_outsourcing_expense(
  p_company_id uuid, p_from date, p_to date, p_unit_price integer default 2000
)
returns table (payee text, qty integer, amount integer)
language plpgsql security definer set search_path = public as $$
declare
  v_segment_id uuid;
  v_store_id uuid;
begin
  -- 計上先の店舗・事業は、その月のパーソナルがいちばん多い店舗（台帳でも画面入力でも）
  select r.store_id, coalesce(r.segment_id, st.segment_id)
    into v_store_id, v_segment_id
  from personal_lesson_source_rows(p_company_id, p_from, p_to) r
  left join stores st on st.id = r.store_id
  group by r.store_id, coalesce(r.segment_id, st.segment_id)
  order by count(*) desc
  limit 1;

  update mon_expense e
     set deleted_at = now()
   where e.company_id = p_company_id
     and e.source = 'lesson_allowance'
     and e.spent_on between p_from and p_to
     and e.deleted_at is null;

  return query
  with counts as (
    select c.staff_name, c.qty
    from personal_lesson_counts(p_company_id, p_from, p_to) c
    where c.payout_mode = 'outsourcing'
      and c.staff_id is not null
      and c.qty > 0
  ),
  agg as (
    select counts.staff_name as nm, sum(counts.qty)::integer as q
    from counts
    group by counts.staff_name
  ),
  ins as (
    insert into mon_expense (
      company_id, segment_id, store_id, spent_on,
      item, payee, amount, category, memo, source
    )
    select
      p_company_id,
      v_segment_id,
      v_store_id,
      p_to,
      'パーソナルレッスン手当',
      agg.nm,
      agg.q * p_unit_price,
      '外注',
      'パーソナルレッスン ' || agg.q || '件 × ' || p_unit_price || '円（レッスン手当 自動計上）',
      'lesson_allowance'
    from agg
    where v_segment_id is not null
    returning mon_expense.payee, mon_expense.amount
  )
  select ins.payee, (ins.amount / p_unit_price)::integer, ins.amount::integer from ins;
end;
$$;

-- 実行権は service_role だけ（0169 と同じ）
revoke all on function personal_lesson_source_rows(uuid, date, date) from public, anon, authenticated;
revoke all on function personal_lesson_counts(uuid, date, date) from public, anon, authenticated;
revoke all on function personal_lesson_unlinked_lines(uuid, date, date) from public, anon, authenticated;
revoke all on function sync_lesson_outsourcing_expense(uuid, date, date, integer) from public, anon, authenticated;
grant execute on function personal_lesson_source_rows(uuid, date, date) to service_role;
grant execute on function personal_lesson_counts(uuid, date, date) to service_role;
grant execute on function personal_lesson_unlinked_lines(uuid, date, date) to service_role;
grant execute on function sync_lesson_outsourcing_expense(uuid, date, date, integer) to service_role;
