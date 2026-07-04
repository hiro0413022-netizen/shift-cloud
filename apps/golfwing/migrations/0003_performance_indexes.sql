-- パフォーマンス改善: 検索・絞り込みに使う複合インデックス追加

-- 商品マスタ: 名前検索・有効フラグ
CREATE INDEX IF NOT EXISTS idx_products_name        ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_is_active   ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_mf_cat      ON products(manufacturer, item_category);
CREATE INDEX IF NOT EXISTS idx_products_active_cat  ON products(is_active, item_category);
CREATE INDEX IF NOT EXISTS idx_products_code        ON products(product_code);

-- 発注明細: 商品ID参照
CREATE INDEX IF NOT EXISTS idx_poi_product          ON purchase_order_items(product_id);

-- 入荷: 日付検索
CREATE INDEX IF NOT EXISTS idx_receipts_date        ON receipts(received_date);

-- 発注: 日付検索
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);
