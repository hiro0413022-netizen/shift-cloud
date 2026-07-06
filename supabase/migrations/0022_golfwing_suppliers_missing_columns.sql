-- 0022_golfwing_suppliers_missing_columns.sql
-- golfwing発注管理: suppliersテーブルの欠落列を追加
--
-- 背景: Supabaseスキーマ(0007)は初期のD1スキーマから作られており、
--   その後のD1マイグレーション(0002 order_method_detail, 0012 cc/連絡先拡張 等)で
--   追加された列が反映されていなかった。
--   このためアプリが参照する s.order_method_detail 等が存在せず、
--   発注詳細ページ(/orders/:id)のSELECTや仕入先登録INSERTが
--   "column ... does not exist" で500になっていた。
-- 対応: アプリが参照する不足列を追加（全てnullable text）。

ALTER TABLE golfwing.suppliers
  ADD COLUMN IF NOT EXISTS order_method_detail text,
  ADD COLUMN IF NOT EXISTS fax                 text,
  ADD COLUMN IF NOT EXISTS fax_number          text,
  ADD COLUMN IF NOT EXISTS line_id             text,
  ADD COLUMN IF NOT EXISTS line_group_id       text,
  ADD COLUMN IF NOT EXISTS website             text,
  ADD COLUMN IF NOT EXISTS postal_code         text,
  ADD COLUMN IF NOT EXISTS address             text;
