-- ============================================================
-- 0095: 業務委託プロのレッスン手当を Money OS の外注費へ自動計上する
--
-- 背景（DECISIONS #106 / #105の残件③）:
--   0094 で担当プロに payout_mode を持たせ、`outsourcing`（安東さん 2026-06〜）は
--   給与明細に載せず「業務委託費に上乗せ」と決めた。ただし実装は給与画面に**表示するだけ**で、
--   実際に外注費として money-os に計上するのは手作業のままだった。
--   → 給与の「集計を実行」と同じタイミングで mon_expense へ自動計上する。
--
-- 設計:
--   - 1か月×1名 = mon_expense 1行（category='外注'・source='lesson_allowance'）
--   - spent_on は**勤務月の月末**（支払は翌月だが、人件費は勤務月に計上する運用に合わせる）
--   - 冪等: 再実行時は source='lesson_allowance' の既存行を論理削除してから入れ直す
--     （#5 物理削除禁止。手入力の外注費 source<>'lesson_allowance' には触らない）
--   - segment_id / store_id は**その月のレッスン売上明細から採る**（店舗→事業の対応表を新設しない）
--
-- ⚠ 二重計上に注意: 通帳CSVやExcel取込で同じ支払を別行として入れると重複する。
--    自動計上分は memo に「（レッスン手当 自動計上）」が入るので、取込時はそちらを消すこと。
-- ============================================================

create or replace function sync_lesson_outsourcing_expense(
  p_company_id uuid,
  p_from date,
  p_to date,
  p_unit_price integer default 2000
)
returns table (
  payee text,
  qty integer,
  amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_segment_id uuid;
  v_store_id uuid;
begin
  -- 計上先の事業・店舗はレッスン売上の実績から採る（最頻値）
  select l.segment_id, l.store_id
    into v_segment_id, v_store_id
  from mon_sales_lines l
  where l.company_id = p_company_id
    and l.deleted_at is null
    and l.sold_on between p_from and p_to
    and l.product_name like '%パーソナルレッスン%'
    and l.product_name like '%25分%'
  group by l.segment_id, l.store_id
  order by count(*) desc
  limit 1;

  -- 既存の自動計上分を論理削除（手入力の外注費は対象外）
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
    -- 表記ゆれ（卜部/春馬のような別名）で複数行に割れても1人1行に束ねる
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
      p_to,                                  -- 勤務月の月末に計上
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

comment on function sync_lesson_outsourcing_expense(uuid, date, date, integer) is
  '業務委託プロ（mon_pros.payout_mode=outsourcing）のパーソナルレッスン手当を mon_expense の外注費へ計上する。冪等（source=lesson_allowance を入れ直す）。DECISIONS #106';

-- 0065のルール: public の新関数は service_role に明示的に EXECUTE を付ける
revoke all on function sync_lesson_outsourcing_expense(uuid, date, date, integer) from public;
grant execute on function sync_lesson_outsourcing_expense(uuid, date, date, integer) to service_role;

-- 自動計上分を探しやすくする
create index if not exists idx_mon_expense_source
  on mon_expense (company_id, source, spent_on) where deleted_at is null;
