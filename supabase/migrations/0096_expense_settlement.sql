-- ============================================================
-- 0096: 経費の「発生」と「支払」を消込でつなぎ、二重計上を構造的に潰す
--
-- 背景（DECISIONS #108）:
--   refresh_money_to_finance は経費をこう足していた:
--     PLの経費 = mon_expense（発生ベース） + mon_bank_txn の確定出金（支払ベース）
--   同じ支払が両方から入ると必ず二重になるのに、**両者を結ぶ鍵が無かった**。
--   0095でレッスン手当の自動計上を入れたことで、この穴が実際に踏める状態になった
--   （安東さんへの業務委託費が「発生（月末計上）」と「通帳の出金」の2回入る）。
--
--   前例: キャディ派遣は「台帳が正典」として2026-01以降の銀行取引を集計から除外している（0078）。
--   ただし除外は事業まるごとの粗い刃なので、今回は**明細単位の消込**にする。
--
-- 設計:
--   - `mon_expense.settled_txn_id` … その経費を支払った銀行/カード取引（多対一。合算振込に対応）
--   - 集計(c)では **出金額から「その取引に紐付いた経費の合計」を差し引く**。
--     全額突合なら0になって消え、一部だけ突合なら残額だけ計上される（合算振込の途中経過でも壊れない）。
--   - 発生側(b)はそのまま＝**人件費・外注費は勤務月に載る**（発生主義を維持）
--   - 突合を消すと自動的に元へ戻る（片方向の破壊をしない）
--
-- 追加のみ（DECISIONS #2）。既存データは settled_txn_id が null なので**金額は一切変わらない**。
-- ============================================================

alter table mon_expense add column if not exists settled_txn_id uuid references mon_bank_txn(id);

comment on column mon_expense.settled_txn_id is
  'この経費を実際に支払った銀行/カード取引。突合するとPL集計で出金側から差し引かれる＝二重計上しない（DECISIONS #108）';

create index if not exists idx_mon_expense_settled
  on mon_expense (settled_txn_id) where deleted_at is null and settled_txn_id is not null;

create or replace function refresh_money_to_finance(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- (b) 現場経費（発生ベース。突合してもここは減らさない＝勤務月・発生月に載る）
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
  --     **経費行と突合済みの金額を差し引く**（#108）。全額突合なら0になり計上されない。
  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, source, memo)
  select p_company_id, coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)::date,
         sum(greatest(abs(t.amount) - t.settled_amount, 0)), 'money', 'Money OS(カード/口座 経費)'
  from (
    select bt.id, bt.segment_id, bt.category, bt.txn_date, bt.amount,
           coalesce((
             select sum(e.amount) from mon_expense e
             where e.settled_txn_id = bt.id and e.deleted_at is null
           ), 0) as settled_amount
    from mon_bank_txn bt
    where bt.company_id=p_company_id and bt.deleted_at is null and bt.status='confirmed' and bt.amount<0
      and (v_caddy is null or bt.segment_id is distinct from v_caddy or bt.txn_date < '2026-01-01')
  ) t
  cross join lateral (select id from fin_segments where company_id=p_company_id and code='hq' and deleted_at is null limit 1) hq
  join fin_categories fc on fc.company_id=p_company_id and fc.deleted_at is null and fc.code=coalesce(t.category,'other_expense') and fc.kind in ('expense','cogs')
  group by coalesce(t.segment_id, hq.id), fc.id, date_trunc('month', t.txn_date)
  having sum(greatest(abs(t.amount) - t.settled_amount, 0)) > 0
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount = fin_entries.amount + excluded.amount, source='money', deleted_at=null, updated_at=now();

  -- (d) カード/口座 確定分の入金→収益
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

grant execute on function refresh_money_to_finance(uuid) to service_role;

-- 未消込の経費に対する「支払候補」を探す（金額一致 → 支払先の部分一致 の順で強い候補を先に返す）
create or replace function suggest_expense_settlements(
  p_company_id uuid,
  p_txn_id uuid
)
returns table (
  expense_id uuid,
  spent_on date,
  item text,
  payee text,
  category text,
  amount integer,
  match_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with txn as (
    select t.id, t.txn_date, abs(t.amount) as amt, coalesce(t.description,'') as descr
    from mon_bank_txn t
    where t.id = p_txn_id and t.company_id = p_company_id and t.deleted_at is null
  )
  select
    e.id,
    e.spent_on,
    e.item,
    e.payee,
    e.category,
    e.amount::integer,
    case
      when e.amount = txn.amt and coalesce(e.payee,'') <> '' and txn.descr like '%' || e.payee || '%' then '金額・支払先が一致'
      when e.amount = txn.amt then '金額が一致'
      else '支払先が一致'
    end
  from mon_expense e, txn
  where e.company_id = p_company_id
    and e.deleted_at is null
    and e.settled_txn_id is null
    -- 支払は発生の後・おおむね2か月以内（前払いも1か月までは許す）
    and e.spent_on between txn.txn_date - interval '75 days' and txn.txn_date + interval '31 days'
    and (
      e.amount = txn.amt
      or (coalesce(e.payee,'') <> '' and txn.descr like '%' || e.payee || '%')
    )
  order by (e.amount = txn.amt) desc, abs(txn.txn_date - e.spent_on)
  limit 10;
$$;

comment on function suggest_expense_settlements(uuid, uuid) is
  '銀行/カード出金に対して「これの発生行では？」という経費の候補を返す。消込UIの候補提示に使う（DECISIONS #108）';

-- 0065のルール: public の新関数は service_role に明示的に EXECUTE を付ける
revoke all on function suggest_expense_settlements(uuid, uuid) from public;
grant execute on function suggest_expense_settlements(uuid, uuid) to service_role;
