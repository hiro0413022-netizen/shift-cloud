-- 仕入先テーブル拡張: LINE ID・FAX・発注方法詳細
ALTER TABLE suppliers ADD COLUMN line_id TEXT;
ALTER TABLE suppliers ADD COLUMN fax TEXT;
ALTER TABLE suppliers ADD COLUMN order_method_detail TEXT;
ALTER TABLE suppliers ADD COLUMN line_group_id TEXT;
ALTER TABLE suppliers ADD COLUMN fax_number TEXT;
ALTER TABLE suppliers ADD COLUMN website TEXT;
ALTER TABLE suppliers ADD COLUMN postal_code TEXT;
ALTER TABLE suppliers ADD COLUMN address TEXT;
ALTER TABLE suppliers ADD COLUMN updated_at TEXT;
