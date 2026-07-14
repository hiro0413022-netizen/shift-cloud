-- 0014_receipt_slip_check.sql
-- 納品書照合・仕入先変更対応
--
-- 追加カラム:
--   receipts.slip_verified   : 納品書確認済みフラグ (0=未確認, 1=確認済)
--   receipts.no_slip         : 納品書なしフラグ (0=納品書あり, 1=納品書なし)
--   receipts.slip_checked_by : 納品書を確認した担当者名
--   receipts.slip_checked_at : 納品書確認日時
--   receipts.slip_note       : 納品書照合メモ（差異内容など）
--   receipts.actual_supplier_id : 実際の仕入先（発注時と異なる場合に記録）

ALTER TABLE receipts ADD COLUMN slip_verified   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receipts ADD COLUMN no_slip         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receipts ADD COLUMN slip_checked_by TEXT;
ALTER TABLE receipts ADD COLUMN slip_checked_at TEXT;
ALTER TABLE receipts ADD COLUMN slip_note       TEXT;
ALTER TABLE receipts ADD COLUMN actual_supplier_id INTEGER REFERENCES suppliers(id);

-- 検索・フィルタ用インデックス
CREATE INDEX IF NOT EXISTS idx_receipts_slip_verified ON receipts(slip_verified);
CREATE INDEX IF NOT EXISTS idx_receipts_no_slip       ON receipts(no_slip);
