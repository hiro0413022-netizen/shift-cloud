-- 0025_money_income_aggregation.sql
-- refresh_money_to_finance に (d)「カード/口座の確定入金→収益」の集約を追加。
-- 出金=経費(kind expense/cogs)、入金=収益(kind revenue) を fin_entries へ。
-- ※本番へは 2026-07-06 に execute_sql で CREATE OR REPLACE 済み。
-- 会計方針: 入金でも「カード引落充当・役員資金・振込返却・現金再入金」は status='ignored' として集計対象外。

create or replace function refresh_money_to_finance(p_company_id uuid)
returns void language plpgsql security definer set search_path = public as $func$
begin
  update fin_entries set deleted_at = now(), amount = 0
  where company_id = p_company_id and source = 'money' and deleted_at is null;

  -- (a) 売上
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, s.segment_id, fc.id, date_trunc('month', s.sold_on)::date, sum(s.amount), 'money', 'Money OS(売上)'
  from mon_sales s
  join mon_category_map m on m.company_id=p_company_id and m.src_kind='sales' and m.src_value=s.category and m.deleted_at is null
  join fin_categories fc on fc.company_id=p_company_id and fc.code=m.fin_category_code and fc.deleted_at is null
  where s.company_id=p_company_id and s.deleted_at is null
  group by s.segment_id, fc.id, date_trunc('month', s.sold_on)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = excluded.amount, source='money', deleted_at=null, updated_at=now();

  -- (b) 現場経費
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, e.segment_id, fc.id, date_trunc('month', e.spent_on)::date, sum(e.amount), 'money', 'Money OS(経費)'
  from mon_expense e
  join fin_categories fc on fc.company_id=p_company_id and fc.deleted_at is null
   and fc.code = coalesce((select m.fin_category_code from mon_category_map m where m.company_id=p_company_id and m.src_kind='expense' and m.src_value=e.category and m.deleted_at is null limit 1),'other_expense')
  where e.company_id=p_company_id and e.deleted_at is null
  group by e.segment_id, fc.id, date_trunc('month', e.spent_on)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = fin_entries.amount + excluded.amount, source='money', deleted_at=null, updated_at=now();

  -- (c) カード/口座 確定分の出金→経費
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)::date, sum(abs(t.amount)), 'money', 'Money OS(カード/口座 経費)'
  from mon_bank_txn t
  cross join lateral (select id from fin_segments where company_id=p_company_id and code='hq' and deleted_at is null limit 1) hq
  join fin_categories fc on fc.company_id=p_company_id and fc.deleted_at is null and fc.code=coalesce(t.category,'other_expense') and fc.kind in ('expense','cogs')
  where t.company_id=p_company_id and t.deleted_at is null and t.status='confirmed' and t.amount<0
  group by coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = fin_entries.amount + excluded.amount, source='money', deleted_at=null, updated_at=now();

  -- (d) カード/口座 確定分の入金→収益
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)::date, sum(t.amount), 'money', 'Money OS(カード/口座 入金)'
  from mon_bank_txn t
  cross join lateral (select id from fin_segments where company_id=p_company_id and code='hq' and deleted_at is null limit 1) hq
  join fin_categories fc on fc.company_id=p_company_id and fc.deleted_at is null and fc.code=coalesce(t.category,'other_income') and fc.kind='revenue'
  where t.company_id=p_company_id and t.deleted_at is null and t.status='confirmed' and t.amount>0
  group by coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = fin_entries.amount + excluded.amount, source='money', deleted_at=null, updated_at=now();

  perform refresh_finance_kpis(p_company_id);
end;
$func$;
