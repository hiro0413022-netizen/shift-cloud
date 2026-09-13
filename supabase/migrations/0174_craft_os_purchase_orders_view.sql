-- 0174_craft_os_purchase_orders_view.sql
-- craft-os から発注の状況（プール／発注済み／入荷済み）を読むための view。（2026-09-13 適用済み）
-- golfwing スキーマは PostgREST に出ていないので、public に読み取り専用で出す。
-- security_invoker なので、見る人の権限（RLS）がそのまま効く。

create or replace view public.gw_purchase_orders
with (security_invoker = true) as
select
  po.id,
  po.company_id,
  po.store_id,
  po.order_no,
  po.batch_code,
  po.order_date,
  po.status,
  po.customer_name,
  po.usage_type,
  po.requested_delivery_date,
  po.ordered_by,
  po.order_note,
  s.name as supplier_name,
  (select count(*) from golfwing.purchase_order_items i where i.purchase_order_id = po.id) as item_count,
  (select min(r.received_date) from golfwing.receipts r where r.purchase_order_id = po.id) as received_date
from golfwing.purchase_orders po
left join golfwing.suppliers s on s.id = po.supplier_id;

grant select on public.gw_purchase_orders to authenticated, service_role;

comment on view public.gw_purchase_orders is
  'craft-os が発注の状況を読むための読み取りビュー。書き込みは gw_create_purchase_drafts 経由';
