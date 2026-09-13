-- 0172_craft_os_phase3_links.sql
-- craft-os Phase 3 のつなぎ込み。（2026-09-13 適用済み）
--   1) 工房 ⇄ 発注管理（golfwing.purchase_orders）の紐づけ
--   2) 入荷登録（golfwing.receipts）で工房の「到着」日を自動で入れる
--   3) 売上計上（mon_sales_lines）の二重計上よけ
--
-- ⚠ 発注管理アプリ（apps/golfwing）のコードには触らない。
--   同じDBに居るので、DB側のトリガーだけで「入荷したら到着」をつなぐ。
--   トリガーが落ちて発注管理の入荷登録が失敗すると業務が止まるので、
--   例外は握りつぶして必ず成功させる（craft-os 側は手で直せる）。

-- ── 1. 工房 ⇄ 発注（1つの作業指示から仕入先ごとに複数の発注が出る）──────
create table if not exists public.gw_work_order_pos (
  id                bigserial primary key,
  company_id        uuid   not null,
  work_order_id     bigint not null references public.gw_work_orders(id) on delete cascade,
  purchase_order_id bigint not null,
  created_at        timestamptz not null default now(),
  constraint gw_wo_po_uniq unique (work_order_id, purchase_order_id)
);
create index if not exists gw_wo_po_po_idx on public.gw_work_order_pos (purchase_order_id);

alter table public.gw_work_order_pos enable row level security;
drop policy if exists tenant_select on public.gw_work_order_pos;
drop policy if exists tenant_insert on public.gw_work_order_pos;
drop policy if exists tenant_delete on public.gw_work_order_pos;
create policy tenant_select on public.gw_work_order_pos for select using (company_id = app.current_company_id());
create policy tenant_insert on public.gw_work_order_pos for insert with check (company_id = app.current_company_id());
create policy tenant_delete on public.gw_work_order_pos for delete using (company_id = app.current_company_id());

-- ── 2. 売上計上の記録（明細1行につき1回だけ）─────────────────────────
create table if not exists public.gw_sales_postings (
  id             bigserial primary key,
  company_id     uuid   not null,
  quote_id       bigint not null references public.gw_quotes(id) on delete cascade,
  quote_item_id  bigint references public.gw_quote_items(id) on delete cascade,
  line_kind      text   not null default 'item',
  sales_line_id  uuid   not null,
  amount         numeric not null,
  posted_by      uuid,
  posted_at      timestamptz not null default now(),
  constraint gw_sales_postings_item_uniq unique (quote_item_id, line_kind)
);
create index if not exists gw_sales_postings_quote_idx on public.gw_sales_postings (quote_id);

alter table public.gw_sales_postings enable row level security;
drop policy if exists tenant_select on public.gw_sales_postings;
drop policy if exists tenant_insert on public.gw_sales_postings;
drop policy if exists tenant_delete on public.gw_sales_postings;
create policy tenant_select on public.gw_sales_postings for select using (company_id = app.current_company_id());
create policy tenant_insert on public.gw_sales_postings for insert with check (company_id = app.current_company_id());
create policy tenant_delete on public.gw_sales_postings for delete using (company_id = app.current_company_id());

-- ── 3. 入荷したら工房の「到着」を自動で入れる ─────────────────────────
create or replace function public.gw_mark_arrived_from_receipt()
returns trigger
language plpgsql
security definer
set search_path to 'public','golfwing'
as $fn$
begin
  begin
    update public.gw_work_orders w
    set arrived_on = coalesce(w.arrived_on, new.received_date),
        status     = case when w.status in ('open','ordered') then 'arrived' else w.status end,
        updated_at = now()
    from public.gw_work_order_pos l
    where l.work_order_id = w.id
      and l.purchase_order_id = new.purchase_order_id
      and w.deleted_at is null
      and w.arrived_on is null;
  exception when others then
    -- 発注管理の入荷登録は絶対に止めない。craft-os 側は画面から手で入れられる
    null;
  end;
  return new;
end;
$fn$;

drop trigger if exists gw_receipts_mark_arrived on golfwing.receipts;
create trigger gw_receipts_mark_arrived
after insert or update of received_date on golfwing.receipts
for each row execute function public.gw_mark_arrived_from_receipt();

comment on function public.gw_mark_arrived_from_receipt() is
  'craft-os: 発注管理で入荷を登録したら、その発注に紐づく工房の作業指示に到着日を入れる。例外は握りつぶす（発注管理を止めないため）';
