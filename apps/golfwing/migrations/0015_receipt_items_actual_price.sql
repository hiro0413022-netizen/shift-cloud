-- 0015_receipt_items_actual_price.sql
-- 納品書照合フロー強化：receipt_itemsに実際の単価・掛率・金額を記録
--
-- 背景:
--   現状、Excelの「単価」「金額」列は purchase_order_items.unit_price を参照しており、
--   実際の納品書に記載された金額と乖離することがある。
--   納品登録・検品時に実際の納品書金額を receipt_items に直接記録することで
--   Excelシートが正確な実績値で埋まるようにする。
--
-- 追加カラム（receipt_items）:
--   actual_unit_price : 納品書記載の実際の単価（NULL = 発注時単価のまま）
--   actual_rate       : 実際の掛率（actual_unit_price / list_price で自動計算保存）
--   actual_amount     : 実際の金額（actual_unit_price × received_quantity）

ALTER TABLE receipt_items ADD COLUMN actual_unit_price REAL;
ALTER TABLE receipt_items ADD COLUMN actual_rate       REAL;
ALTER TABLE receipt_items ADD COLUMN actual_amount     REAL;

-- 検索・集計用インデックス
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items(receipt_id);
