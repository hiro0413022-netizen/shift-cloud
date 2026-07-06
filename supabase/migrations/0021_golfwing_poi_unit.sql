-- 0021_golfwing_poi_unit.sql
-- golfwing発注管理: 発注明細に単位(unit)列を追加
--
-- 背景: メール本文の数量単位が常に「本」固定になっていた。
--   purchase_order_items に unit 列が無く、商品マスタ(products.unit)も参照して
--   いなかったため。アプリ側は各INSERTで商品マスタの単位を保存するよう修正済み。
-- 対応: unit列を追加し、既存明細は紐づく商品の単位でbackfill。

ALTER TABLE golfwing.purchase_order_items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '本';

UPDATE golfwing.purchase_order_items poi
SET unit = p.unit
FROM golfwing.products p
WHERE poi.product_id = p.id
  AND p.unit IS NOT NULL AND p.unit <> ''
  AND poi.unit = '本' AND p.unit <> '本';
