-- purchase_orders: pool ステータス対応（既存のstatus列はTEXTなのでそのまま使える）
-- suppliersに送料無料閾値カラム追加
ALTER TABLE suppliers ADD COLUMN free_shipping_threshold INTEGER DEFAULT NULL;

-- 既存のshipping_ruleから数値を自動抽出してセット
UPDATE suppliers SET free_shipping_threshold = 25000 WHERE id = 7;  -- ワークス
UPDATE suppliers SET free_shipping_threshold = 20000 WHERE id = 2;  -- グラファイトデザイン
UPDATE suppliers SET free_shipping_threshold = 20000 WHERE id = 10; -- シンカグラファイト
UPDATE suppliers SET free_shipping_threshold = 20000 WHERE id = 11; -- コンポジットテクノ
UPDATE suppliers SET free_shipping_threshold = 30000 WHERE id = 12; -- TRPX
UPDATE suppliers SET free_shipping_threshold = 25000 WHERE id = 16; -- 朝日ゴルフ
UPDATE suppliers SET free_shipping_threshold = 11000 WHERE id = 20; -- iomic
UPDATE suppliers SET free_shipping_threshold = 15000 WHERE id = 21; -- STM
UPDATE suppliers SET free_shipping_threshold = 20000 WHERE id = 24; -- エリートグリップ
