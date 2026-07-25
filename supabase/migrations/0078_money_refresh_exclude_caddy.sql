-- 0078: キャディ派遣の財務二重計上を恒久修正（DECISIONS #83）
-- 背景: refresh_money_to_finance が銀行明細をPLへ流すため、キャディ派遣では
--   Caddy OS（cad_dispatches=台帳）の売上/外注費と、同じ金の入出金（売掛回収・外注払い）が二重計上されていた。
--   さらに 2026-06-02 の役員報酬振込（小川1,100,000）が labor/caddy に誤分類されキャディ人件費が異常値に。
-- 決定:
--   (1) 銀行明細の (c)出金/(d)入金 集約から caddy セグメントを除外（2026-01以降のみ。2025年は銀行が唯一のソース）
--   (2) 関数末尾で必ず refresh_caddy_finance() を呼び、台帳集計（source='caddy_os'）を正典として再構築
--   (3) 社員キャディ（林さん）の人件費は source='caddy_manual' の発生ベース行で保持（wipe対象外）
-- 適用: MCP経由で本番適用済（0078 + 0078b補正）。本ファイルは最終版の記録。

CREATE OR REPLACE FUNCTION public.refresh_money_to_finance(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caddy uuid;
begin
  select id into v_caddy from fin_segments where company_id=p_company_id and code='caddy' and deleted_at is null;

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

  -- (c) カード/口座 確定分の出金→経費（キャディは2026-01以降除外=台帳が正典）
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)::date, sum(abs(t.amount)), 'money', 'Money OS(カード/口座 経費)'
  from mon_bank_txn t
  cross join lateral (select id from fin_segments where company_id=p_company_id and code='hq' and deleted_at is null limit 1) hq
  join fin_categories fc on fc.company_id=p_company_id and fc.deleted_at is null and fc.code=coalesce(t.category,'other_expense') and fc.kind in ('expense','cogs')
  where t.company_id=p_company_id and t.deleted_at is null and t.status='confirmed' and t.amount<0
    and (v_caddy is null or t.segment_id is distinct from v_caddy or t.txn_date < '2026-01-01')
  group by coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = fin_entries.amount + excluded.amount, source='money', deleted_at=null, updated_at=now();

  -- (d) カード/口座 確定分の入金→収益（キャディは2026-01以降除外=台帳が正典）
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)::date, sum(t.amount), 'money', 'Money OS(カード/口座 入金)'
  from mon_bank_txn t
  cross join lateral (select id from fin_segments where company_id=p_company_id and code='hq' and deleted_at is null limit 1) hq
  join fin_categories fc on fc.company_id=p_company_id and fc.deleted_at is null and fc.code=coalesce(t.category,'other_income') and fc.kind='revenue'
  where t.company_id=p_company_id and t.deleted_at is null and t.status='confirmed' and t.amount>0
    and (v_caddy is null or t.segment_id is distinct from v_caddy or t.txn_date < '2026-01-01')
  group by coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = fin_entries.amount + excluded.amount, source='money', deleted_at=null, updated_at=now();

  perform refresh_caddy_finance(p_company_id, null);
  perform refresh_finance_kpis(p_company_id);
end;
$function$;
GRANT EXECUTE ON FUNCTION public.refresh_money_to_finance(uuid) TO service_role;
