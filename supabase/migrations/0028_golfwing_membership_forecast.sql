-- 月会費予測（会員種別×単価）を専用カテゴリでfin_entriesへ自動反映。
-- ファイン実績(mon_sales category='月会費')がある月は予測を停止・論理削除（実績優先）。
-- 単価・ルールの正典: docs/genesis/DECISIONS.md #31 / memory golfwing-sales-methodology
-- ※本DBには mcp apply_migration で適用済（冪等: CREATE OR REPLACE / ON CONFLICT）。

insert into fin_categories (company_id, code, name, kind, sort_order)
select id, 'membership_forecast', '月会費（予測）', 'revenue', 15 from companies where deleted_at is null
on conflict (company_id, code) do nothing;

create or replace function public.refresh_golfwing_membership_forecast(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_seg uuid;
  v_cat uuid;
  v_month date := date_trunc('month', current_date)::date;
  v_next  date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_amount numeric;
  v_actual_exists boolean;
begin
  select id into v_seg from fin_segments where company_id=p_company_id and code='golf' and deleted_at is null limit 1;
  select id into v_cat from fin_categories where company_id=p_company_id and code='membership_forecast' and deleted_at is null limit 1;
  if v_seg is null or v_cat is null then return; end if;

  -- 実績優先: 当月のファイン実績(mon_sales 月会費)があれば予測行を消して終了
  select exists(
    select 1 from mon_sales
    where company_id=p_company_id and segment_id=v_seg and category='月会費'
      and deleted_at is null and sold_on >= v_month and sold_on < v_next
  ) into v_actual_exists;

  if v_actual_exists then
    update fin_entries set deleted_at = now(), updated_at = now()
    where company_id=p_company_id and segment_id=v_seg and category_id=v_cat and target_month=v_month and deleted_at is null;
    return;
  end if;

  -- 月会費予測（税抜）: 会員種別×単価。課金対象=在籍(退会は退会月末まで課金)かつ当月非休会。GOLF WING会員のみ。
  select coalesce(sum(
    case m.member_type
      when 'レギュラー会員' then 17500
      when 'マスター会員' then 22500
      when 'プラチナレギュラー会員' then 17500
      when 'ライト会員' then 9800
      when '法人会員' then 55000
      when 'レギュラー家族割会員' then 12250
      else 0  -- 法人会員2枚目/チケット会員/モニター会員/トライアル会員/スタッフ = 0
    end
  ),0) into v_amount
  from mbr_members m
  where m.company_id=p_company_id
    and coalesce(m.store_name,'') not ilike '%FRUNK%'
    and coalesce(m.store_name,'') not like '%姫路%'
    and coalesce(m.join_date, date '1900-01-01') < v_next
    and (m.leave_date is null or m.leave_date >= v_month)
    and not (
      to_date(nullif(trim(m.suspend_start),''),'YYYY/MM') is not null
      and to_date(nullif(trim(m.suspend_start),''),'YYYY/MM') <= v_month
      and coalesce(to_date(nullif(trim(m.suspend_end),''),'YYYY/MM'), to_date(nullif(trim(m.suspend_start),''),'YYYY/MM')) >= v_month
    );

  insert into fin_entries (company_id, segment_id, category_id, target_month, amount, memo, source)
  values (p_company_id, v_seg, v_cat, v_month, v_amount,
    '月会費予測(会員種別×単価/税抜/暫定・ファイン実績が入れば自動停止)', 'forecast')
  on conflict (company_id, segment_id, category_id, target_month)
  do update set amount=excluded.amount, memo=excluded.memo, source='forecast', updated_at=now(), deleted_at=null;
end;
$function$;
