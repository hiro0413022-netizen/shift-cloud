-- 商品ごとの複数仕入先対応
-- product_suppliers: 商品と仕入先の多対多 + 仕入先別掛け率
CREATE TABLE IF NOT EXISTS product_suppliers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  rate        REAL,                     -- 掛け率 (例: 0.65 = 65%)
  is_default  INTEGER DEFAULT 0,        -- 1 = デフォルト仕入先
  notes       TEXT,                     -- 備考（例：急ぎ用、送料無料条件など）
  sort_order  INTEGER DEFAULT 0,
  tenant_id   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id)  REFERENCES products(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_product  ON product_suppliers(product_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier ON product_suppliers(supplier_id, tenant_id);
