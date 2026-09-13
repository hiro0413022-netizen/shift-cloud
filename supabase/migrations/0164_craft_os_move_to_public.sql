-- 適用済み: 2026-09-12（Supabase migration名 craft_os_move_to_public）
-- craft-os のテーブルを public へ移し、他モジュールと同じ接頭辞（gw_）に揃える。
--
-- 理由: 他の全モジュール（cmp_ / nite_ / frunk_ / mbr_ / lsn_ / inv_ / mon_ …）は public に
--   接頭辞つきで置かれており、Next.js アプリは PostgREST 経由で読み書きしている。
--   golfwing スキーマは発注管理アプリ（Hono＋直pg接続）専用で、PostgREST には出ていない。
--   商品マスタ（golfwing.products）はそのまま正典として残し、読み取り用のビューを public に置く。

alter table golfwing.demo_shafts       set schema public;
alter table golfwing.labor_rates       set schema public;
alter table golfwing.discount_rules    set schema public;
alter table golfwing.quotes            set schema public;
alter table golfwing.quote_items       set schema public;
alter table golfwing.work_orders       set schema public;
alter table golfwing.work_order_specs  set schema public;

alter table public.demo_shafts      rename to gw_demo_shafts;
alter table public.labor_rates      rename to gw_labor_rates;
alter table public.discount_rules   rename to gw_discount_rules;
alter table public.quotes           rename to gw_quotes;
alter table public.quote_items      rename to gw_quote_items;
alter table public.work_orders      rename to gw_work_orders;
alter table public.work_order_specs rename to gw_work_order_specs;

alter function golfwing.next_quote_seq(uuid)      set schema public;
alter function golfwing.next_work_order_seq(uuid) set schema public;
alter function public.next_quote_seq(uuid)        rename to gw_next_quote_seq;
alter function public.next_work_order_seq(uuid)   rename to gw_next_work_order_seq;

create or replace view public.gw_products with (security_invoker = on) as
  select id, company_id, product_code, barcode, item_category, manufacturer, name, spec, color,
         club_type, list_price, default_rate, default_supplier_id, unit, source, is_active,
         supplier_item_code, updated_at
  from golfwing.products;

create or replace view public.gw_suppliers with (security_invoker = on) as
  select id, company_id, name, alias_names, contact_name, honorific, order_method, phone, email,
         payment_method, shipping_rule, is_active
  from golfwing.suppliers;

comment on view public.gw_products is
  '発注管理の商品マスタ（golfwing.products）の読み取り用。定価の正典はあちら。craft-os はここを引くだけで定価を持たない';

revoke all on public.gw_products  from anon;
revoke all on public.gw_suppliers from anon;
grant select on public.gw_products  to authenticated, service_role;
grant select on public.gw_suppliers to authenticated, service_role;

do $do$
declare s text;
begin
  foreach s in array array['gw_demo_shafts_id_seq','gw_labor_rates_id_seq','gw_discount_rules_id_seq',
                           'gw_quotes_id_seq','gw_quote_items_id_seq','gw_work_orders_id_seq','gw_work_order_specs_id_seq']
  loop
    begin
      execute format('grant usage, select on sequence public.%I to authenticated, service_role', s);
    exception when undefined_table then
      raise notice 'sequence % not found', s;
    end;
  end loop;
end $do$;

revoke execute on function public.gw_next_quote_seq(uuid) from public;
revoke execute on function public.gw_next_work_order_seq(uuid) from public;
grant execute on function public.gw_next_quote_seq(uuid) to authenticated, service_role;
grant execute on function public.gw_next_work_order_seq(uuid) to authenticated, service_role;
