-- 0020_golfwing_company_id_default.sql
-- golfwing発注管理: company_id(NOT NULL)にデフォルトを設定
--
-- 背景: golfwingアプリはD1(SQLite)由来で company_id を扱わないが、
--   Supabaseスキーマ(0007)は全書き込み対象テーブルに company_id NOT NULL を持つ。
--   このためアプリからのINSERT(商品登録/CSVインポート/発注作成/プール追加/
--   納品/判定ルール/仕入先登録/商品仕入先)がすべて
--   "null value in column company_id violates not-null constraint" で失敗していた。
-- 対応: 単一会社運用のため、既存全行が使用する会社UUIDをデフォルトに設定し、
--   company_id未指定のINSERTを通す。既存行は不変。
--   ※2社目を追加する場合はアプリ側でsessionからcompany_idを設定する実装へ移行すること。

DO $$
DECLARE cid uuid := 'ec00ad2a-4032-4061-bdb7-03face8a04e7';
BEGIN
  EXECUTE format('ALTER TABLE golfwing.products             ALTER COLUMN company_id SET DEFAULT %L', cid);
  EXECUTE format('ALTER TABLE golfwing.suppliers            ALTER COLUMN company_id SET DEFAULT %L', cid);
  EXECUTE format('ALTER TABLE golfwing.product_suppliers    ALTER COLUMN company_id SET DEFAULT %L', cid);
  EXECUTE format('ALTER TABLE golfwing.purchase_orders      ALTER COLUMN company_id SET DEFAULT %L', cid);
  EXECUTE format('ALTER TABLE golfwing.purchase_order_items ALTER COLUMN company_id SET DEFAULT %L', cid);
  EXECUTE format('ALTER TABLE golfwing.receipts             ALTER COLUMN company_id SET DEFAULT %L', cid);
  EXECUTE format('ALTER TABLE golfwing.receipt_items        ALTER COLUMN company_id SET DEFAULT %L', cid);
  EXECUTE format('ALTER TABLE golfwing.supplier_rules       ALTER COLUMN company_id SET DEFAULT %L', cid);
END $$;
