-- 0023_money_store_scope.sql
-- お金を店舗単位に。stores→事業(segment)対応づけ、mon_* に store_id を付与。
-- 集計は 店舗→事業(segment)→fin_entries（既存RPCはsegment単位のまま有効）。
-- ※本番へは 2026-07-06 に apply_migration(money_store_scope_0023) で適用済み。

-- 1. stores に事業(segment)を対応づけ（名前ベースでバックフィル）
alter table stores add column if not exists segment_id uuid references fin_segments(id);

update stores s set segment_id = (
  select f.id from fin_segments f
  where f.company_id = s.company_id and f.code = 'golf' and f.deleted_at is null limit 1)
where s.segment_id is null
  and (s.name like '%GOLF WING%' or s.name like '%宝塚%' or s.name like '%夙川%' or s.name like '%新宿%' or s.name like '%明石%');

update stores s set segment_id = (
  select f.id from fin_segments f
  where f.company_id = s.company_id and f.code = 'himeji' and f.deleted_at is null limit 1)
where s.segment_id is null
  and (s.name like '%FRUNK%' or s.name like '%姫路%');

-- 2. mon_* に店舗を付与（nullable。既存segment_idは店舗の事業を保持し続ける）
alter table mon_sales add column if not exists store_id uuid references stores(id);
alter table mon_cash_ledger add column if not exists store_id uuid references stores(id);
alter table mon_cash_count add column if not exists store_id uuid references stores(id);
alter table mon_expense add column if not exists store_id uuid references stores(id);
alter table mon_bank_txn add column if not exists store_id uuid references stores(id);

create index if not exists idx_mon_sales_store on mon_sales (company_id, store_id, sold_on);
create index if not exists idx_mon_cash_ledger_store on mon_cash_ledger (company_id, store_id, entry_date);
create index if not exists idx_mon_cash_count_store on mon_cash_count (company_id, store_id, counted_at);
create index if not exists idx_mon_expense_store on mon_expense (company_id, store_id, spent_on);
