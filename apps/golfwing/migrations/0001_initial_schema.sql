-- ゴルフウィング発注管理システム 初期スキーマ

CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    alias_names TEXT,
    contact_name TEXT,
    honorific TEXT,
    order_method TEXT,
    phone TEXT,
    email TEXT,
    payment_method TEXT,
    notes TEXT,
    shipping_rule TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_category TEXT,
    manufacturer TEXT,
    club_type TEXT,
    supplier_id INTEGER NOT NULL,
    rate REAL,
    priority INTEGER DEFAULT 100,
    notes TEXT,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT,
    barcode TEXT,
    item_category TEXT NOT NULL,
    manufacturer TEXT,
    name TEXT NOT NULL,
    spec TEXT,
    color TEXT,
    club_type TEXT,
    list_price REAL,
    default_rate REAL,
    default_supplier_id INTEGER,
    unit TEXT DEFAULT '本',
    source TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (default_supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_code TEXT NOT NULL,
    order_no TEXT NOT NULL UNIQUE,
    order_date TEXT NOT NULL,
    ordered_by TEXT,
    supplier_id INTEGER NOT NULL,
    customer_name TEXT,
    usage_type TEXT,
    requested_delivery_date TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    order_note TEXT,
    email_subject TEXT,
    email_body TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    product_id INTEGER,
    item_category TEXT NOT NULL,
    manufacturer TEXT,
    product_name TEXT NOT NULL,
    spec TEXT,
    color TEXT,
    club_type TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    list_price REAL,
    rate REAL,
    unit_price REAL,
    amount REAL,
    customer_name TEXT,
    usage_type TEXT,
    requested_delivery_date TEXT,
    line_note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    received_date TEXT NOT NULL,
    slip_date TEXT,
    inspected_by TEXT,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
);

CREATE TABLE IF NOT EXISTS receipt_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL,
    purchase_order_item_id INTEGER NOT NULL,
    received_quantity INTEGER NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receipt_id) REFERENCES receipts(id),
    FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_products_category ON products(item_category);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products(manufacturer);
CREATE INDEX IF NOT EXISTS idx_supplier_rules_supplier ON supplier_rules(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_batch ON purchase_orders(batch_code);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_poi_order ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_poi ON receipt_items(purchase_order_item_id);
CREATE INDEX IF NOT EXISTS idx_receipts_order ON receipts(purchase_order_id);
