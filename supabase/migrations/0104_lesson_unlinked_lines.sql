-- ============================================================
-- 0104: レッスン手当「担当プロ未紐付け」を明細単位で返す
--
-- 背景:
--   0094 の personal_lesson_counts は担当プロ別の**集計**しか返さないため、
--   給与画面の警告は「◯◯ — 1件」と出るだけで、どの売上明細のことか分からず
--   money-os を探し回る必要があった（2026-08-10 ユーザー指摘）。
--   → 警告からその場で直せるように、原因となっている明細そのものを返す。
--
-- 対象:
--   パーソナルレッスン（25分）のうち、担当プロがスタッフに解決できない明細
--     (a) pro が空欄            → 給与画面で担当プロを選んで mon_sales_lines.pro を埋める
--     (b) pro はあるが名簿に無い → 既存プロの別名に追加 / 新規プロとしてスタッフに紐付け
--   判定ロジック（表記ゆれの吸収・別名）は personal_lesson_counts と同じにする。
--
-- 追加のみ（DECISIONS #2）。
-- ============================================================

create or replace function personal_lesson_unlinked_lines(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  line_id uuid,
  store_id uuid,
  sold_on date,
  customer_name text,
  product_name text,
  item_category text,
  qty integer,
  amount integer,
  raw_pro text,
  memo text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id as line_id,
    l.store_id,
    l.sold_on,
    l.customer_name,
    l.product_name,
    l.item_category,
    l.qty::integer,
    l.amount::integer,
    -- 0094と同じ正規化（前後空白と末尾の「プロ」を落とす）。空欄は null で返す
    nullif(regexp_replace(btrim(coalesce(l.pro, '')), 'プロ$', ''), '') as raw_pro,
    l.memo
  from mon_sales_lines l
  left join mon_pros p
    on p.deleted_at is null
   and p.company_id = p_company_id
   and (
        p.name = nullif(regexp_replace(btrim(coalesce(l.pro, '')), 'プロ$', ''), '')
     or nullif(regexp_replace(btrim(coalesce(l.pro, '')), 'プロ$', ''), '') = any(p.aliases)
   )
  where l.company_id = p_company_id
    and l.deleted_at is null
    and l.sold_on between p_from and p_to
    and l.product_name like '%パーソナルレッスン%'
    and l.product_name like '%25分%'
    and p.staff_id is null   -- 名簿に無い / 名簿にはあるがスタッフ未紐付け / pro空欄
  order by l.sold_on, l.customer_name;
$$;

comment on function personal_lesson_unlinked_lines(uuid, date, date) is
  '担当プロがスタッフに解決できないパーソナルレッスン明細を返す。給与画面の警告からその場で修正するために使う（0094の集計版の明細版）';

-- 0065のルール: public の新関数は service_role に明示的に EXECUTE を付ける
revoke all on function personal_lesson_unlinked_lines(uuid, date, date) from public;
grant execute on function personal_lesson_unlinked_lines(uuid, date, date) to service_role;
