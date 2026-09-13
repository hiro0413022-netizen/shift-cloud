-- 適用済み: 2026-09-12（Supabase migration名 craft_os_fix_seq_fn_after_move / craft_os_quote_items_supplier_rate）
--
-- ① 0164 でテーブルを public.gw_* へ移したとき、採番関数の本文が旧名（golfwing.quotes）のままだった。
--    SET SCHEMA では関数の中身は書き換わらない。実データで1件通そうとして初めて出た不具合。
create or replace function public.gw_next_quote_seq(p_company uuid)
returns integer language sql security definer set search_path = public as $fn$
  select coalesce(max(quote_seq), 0) + 1 from public.gw_quotes where company_id = p_company;
$fn$;

create or replace function public.gw_next_work_order_seq(p_company uuid)
returns integer language sql security definer set search_path = public as $fn$
  select coalesce(max(order_seq), 0) + 1 from public.gw_work_orders where company_id = p_company;
$fn$;

revoke execute on function public.gw_next_quote_seq(uuid) from public;
revoke execute on function public.gw_next_work_order_seq(uuid) from public;
grant execute on function public.gw_next_quote_seq(uuid) to authenticated, service_role;
grant execute on function public.gw_next_work_order_seq(uuid) to authenticated, service_role;

-- ② スタッフ購入は仕入値（商品マスタの掛け率）で出すため、明細に入れた時点の仕入掛け率を写し取る。
alter table public.gw_quote_items add column if not exists supplier_rate numeric(5,3);
comment on column public.gw_quote_items.supplier_rate is
  '明細に入れた時点の仕入掛け率（golfwing.products.default_rate の写し）。スタッフ購入の計算に使う';
