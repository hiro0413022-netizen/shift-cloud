-- ============================================================
-- 0094: パーソナルレッスン手当を Money OS の売上台帳から自動算出する
--
-- 背景:
--   給与のレッスン手当（パーソナルレッスン25分 1件 = 2,000円）は 0035 で
--   payroll_allowances の器だけ用意されていたが、**入力する画面が無く SQL 直打ち**
--   だった（2026-06分は手作業で投入されている）。
--   一方、実績そのものは Money OS の売上台帳に既に入っている:
--     mon_sales_lines.product_name = 'パーソナルレッスン（25分）' / 単価2,000 / pro=担当プロ
--   → 二重入力をやめ、**売上台帳を唯一の入力元**にする（DECISIONS #105）。
--
-- 課題と解き方:
--   (1) mon_sales_lines.pro は自由記述の姓（表記ゆれ「古川プロ」、別名「春馬」=卜部さん）
--       → mon_pros に aliases（表記ゆれ配列）を持たせて名寄せする
--   (2) 担当プロ ≠ 給与スタッフ（外部プロもいる / 0088のコメント参照）
--       → mon_pros.staff_id で任意に紐付ける。未紐付けは集計に出すが取込対象外
--   (3) 同じ「担当した」でも支払われ方が3通りある
--       → payout_mode: payroll（給与の手当）/ outsourcing（業務委託費に上乗せ）/ none（対象外）
--         ・古川博庸（月給・役員報酬）はレッスンを持っても手当を付けない = none
--         ・安東茉優は2026-06から業務委託 = outsourcing（給与明細に載せない）
--
-- 追加のみ（DECISIONS #2）。
-- ============================================================

-- 1. 担当プロ名簿に「誰の給与か」「どう払うか」を持たせる
alter table mon_pros add column if not exists staff_id uuid references staff(id);
alter table mon_pros add column if not exists aliases text[] not null default '{}';
alter table mon_pros add column if not exists payout_mode text not null default 'payroll'
  check (payout_mode in ('payroll', 'outsourcing', 'none'));

comment on column mon_pros.staff_id is '給与スタッフへの紐付け。nullなら手当の自動取込対象外（外部プロ等）';
comment on column mon_pros.aliases is '売上台帳 mon_sales_lines.pro の表記ゆれ・通称（例: 卜部→{春馬}）';
comment on column mon_pros.payout_mode is 'payroll=給与の手当 / outsourcing=業務委託費に上乗せ（給与明細に載せない） / none=対象外';

create index if not exists idx_mon_pros_staff on mon_pros (staff_id) where deleted_at is null;

-- 2. 既存6名の紐付け（2026-08-06 ユーザー確認）
--    「春馬」は卜部凡夫さんの通称。古川さんは月給のため手当対象外。安東さんは業務委託。
update mon_pros p set
  staff_id = s.id,
  aliases = case when p.name = '卜部' then array['春馬'] else p.aliases end,
  payout_mode = case
    when p.name = '古川' then 'none'
    when p.name = '安東' then 'outsourcing'
    else 'payroll'
  end
from staff s
where p.deleted_at is null
  and s.deleted_at is null
  and s.company_id = p.company_id
  and s.name like p.name || '%'   -- 名簿は姓のみ（古川→古川博庸）
  and p.staff_id is null;

-- 3. 月次のパーソナルレッスン件数を担当プロ別に返す
--    件数は qty の合計（1明細で複数回のことがある）。item_category='返金' はマイナス計上。
--    紐付けできなかったプロ名も staff_id=null で返す＝画面で「未紐付け」として気付ける。
create or replace function personal_lesson_counts(
  p_company_id uuid,
  p_from date,
  p_to date
)
returns table (
  pro_name text,
  staff_id uuid,
  staff_name text,
  payout_mode text,
  qty integer,
  sales_amount integer
)
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select
      -- 表記ゆれ吸収: 前後空白と末尾の「プロ」を落とす
      nullif(regexp_replace(btrim(coalesce(l.pro, '')), 'プロ$', ''), '') as raw_pro,
      case when l.item_category = '返金' then -l.qty else l.qty end as q,
      case when l.item_category = '返金' then -l.amount else l.amount end as amt
    from mon_sales_lines l
    where l.company_id = p_company_id
      and l.deleted_at is null
      and l.sold_on between p_from and p_to
      and l.product_name like '%パーソナルレッスン%'
      and l.product_name like '%25分%'
  ),
  matched as (
    select
      lines.raw_pro,
      p.staff_id,
      coalesce(p.payout_mode, 'payroll') as payout_mode,
      lines.q,
      lines.amt
    from lines
    left join mon_pros p
      on p.deleted_at is null
     and p.company_id = p_company_id
     and (p.name = lines.raw_pro or lines.raw_pro = any(p.aliases))
  )
  select
    coalesce(m.raw_pro, '(未設定)') as pro_name,
    m.staff_id,
    s.name as staff_name,
    m.payout_mode,
    sum(m.q)::integer as qty,
    sum(m.amt)::integer as sales_amount
  from matched m
  left join staff s on s.id = m.staff_id
  group by 1, 2, 3, 4
  having sum(m.q) <> 0
  order by 5 desc;
$$;

comment on function personal_lesson_counts(uuid, date, date) is
  'Money OS売上台帳から月次のパーソナルレッスン（25分）件数を担当プロ別に集計する。給与のレッスン手当の算出元（DECISIONS #105）';

-- 0065のルール: public の新関数は service_role に明示的に EXECUTE を付ける
revoke all on function personal_lesson_counts(uuid, date, date) from public;
grant execute on function personal_lesson_counts(uuid, date, date) to service_role;
