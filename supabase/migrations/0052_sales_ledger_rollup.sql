-- 0052_sales_ledger_rollup.sql
-- 売上台帳（売上データ.xlsx）→ mon_sales_lines → mon_sales → fin_entries の最後の1本を自動化する。
--
-- 現状の穴（2026-07-14）:
--   mon_sales_lines には6月まで台帳明細が入っているのに、月次サマリ mon_sales は5月で止まっていた。
--   そのため6月の売上は fin_entries に source='sales_ledger' で**手入力**されていた（1,487,906）。
--   毎月この手入力が必要な状態＝止まる。ここを関数化する。
--
-- 【重要な落とし穴】月会費のカテゴリを分ける理由:
--   0028 の refresh_golfwing_membership_forecast() は
--   「その月の mon_sales に category='月会費' があれば実績が来たとみなして予測を削除する」。
--   台帳の月会費（窓口・SB決済の入会金や日割り）は**口座振替の月会費実績ではない**ので、
--   これを '月会費' として入れると予測(約350万)が消えて売上が激減する。
--   → 台帳由来のものは **'月会費(窓口)'** として入れる。'月会費' はファインの口座振替実績専用に温存する。

-- ============================================================
-- 1. カテゴリ対応（これが無いと fin_entries に流れず売上から消える）
-- ============================================================
insert into mon_category_map (company_id, src_kind, src_value, fin_category_code)
select c.id, 'sales', v.src, v.code
from companies c
cross join (values
  ('月会費(窓口)', 'sales'),   -- 窓口決済の会費・入会金・日割り（口座振替とは別物）
  ('工賃',         'sales'),   -- グリップ交換等
  ('参加料',       'sales'),
  ('参加費',       'sales'),   -- 台帳の表記ゆれ
  ('送料',         'sales'),
  ('返金',         'sales')    -- 負の金額。売上から差し引く
) as v(src, code)
where c.deleted_at is null
  and not exists (
    select 1 from mon_category_map m
    where m.company_id = c.id and m.src_kind = 'sales'
      and m.src_value = v.src and m.deleted_at is null
  );

-- ============================================================
-- 2. 台帳明細 → 月次サマリ（品目別・税抜）
--    べき等: 何度実行しても同じ結果になる（同月の台帳由来行を作り直す）
-- ============================================================
create or replace function refresh_mon_sales_from_lines(p_company_id uuid, p_month date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_next  date := (v_month + interval '1 month')::date;
  v_eom   date := (v_next - interval '1 day')::date;   -- 月末日（sold_onの慣例）
  v_rows  int;
begin
  -- 台帳由来の既存行だけを作り直す。
  -- ファインの口座振替実績（category='月会費'）と手入力分は触らない。
  update mon_sales set deleted_at = now(), updated_at = now()
  where company_id = p_company_id
    and source = 'ledger'
    and deleted_at is null
    and sold_on >= v_month and sold_on < v_next;

  insert into mon_sales (
    company_id, store_id, segment_id, sold_on, category,
    amount, tax_included, memo, source
  )
  select
    l.company_id,
    l.store_id,
    l.segment_id,
    v_eom,
    -- 台帳の「月会費」は窓口決済。口座振替の実績と混ぜない（予測が止まるため）
    case when l.item_category = '月会費' then '月会費(窓口)' else l.item_category end,
    sum(l.amount),
    sum(l.tax_included),
    '売上台帳(' || to_char(v_month, 'YYYY年M月') || ')',
    'ledger'
  from mon_sales_lines l
  where l.company_id = p_company_id
    and l.deleted_at is null
    and l.sold_on >= v_month and l.sold_on < v_next
  group by l.company_id, l.store_id, l.segment_id,
    case when l.item_category = '月会費' then '月会費(窓口)' else l.item_category end
  having sum(l.amount) <> 0;

  get diagnostics v_rows = row_count;

  -- fin_entries（財務・KPIの正典）へ反映
  perform refresh_money_to_finance(p_company_id);

  return v_rows;
end $$;

comment on function refresh_mon_sales_from_lines(uuid, date) is
  '売上台帳明細(mon_sales_lines)→月次サマリ(mon_sales, source=ledger)→fin_entries。べき等。台帳の月会費は「月会費(窓口)」として入れ、口座振替実績(月会費)と区別する（0028の予測停止トリガーを誤爆させない）';
