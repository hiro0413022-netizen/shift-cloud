-- 仕入先ごとのCCアドレス帳
-- suppliers.cc_emails: カンマ区切りで複数CC設定可能
ALTER TABLE suppliers ADD COLUMN cc_emails TEXT;
