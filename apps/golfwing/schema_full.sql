-- =================================================================
-- GolfOrder (golfwing-order) - Full Database Schema
-- Generated from migrations 0001 ~ 0015
-- Cloudflare D1 (SQLite compatible)
-- Database: golfwing-production (eb6484c8-67de-48c0-83ee-b250d95f89ef)
-- =================================================================

-- ----------------------------------------------------------------
-- 0001_initial_schema.sql
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 0002_suppliers_order_method.sql
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 0003_performance_indexes.sql
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 0004_supplier_rules.sql
-- ----------------------------------------------------------------
-- supplier_rules 一括設定
-- エクセル「仕入れ先一覧.xlsx」をもとに設定
-- 既存データを全削除してから再投入
-- 実行日: 2026-05-09

PRAGMA foreign_keys = OFF;

DELETE FROM supplier_rules;

-- ============================================================
-- シャフト / フジクラ  → フジクラシャフト株式会社 (id=1)
-- DR=0.45 FW=0.45 UT=0.45 IR=0.50
-- DBのメーカー名: "フジクラ"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'フジクラ', 'DR',   1, 0.45, 10, 'フジクラ DR'),
('シャフト', 'フジクラ', 'FW',   1, 0.45, 10, 'フジクラ FW'),
('シャフト', 'フジクラ', 'UT',   1, 0.45, 10, 'フジクラ UT'),
('シャフト', 'フジクラ', 'IRON', 1, 0.50, 10, 'フジクラ IR');

-- ============================================================
-- シャフト / グラファイトデザイン → グラファイトデザイン株式会社 (id=2)
-- DR=0.45 FW=0.45 UT=0.45
-- DBのメーカー名: "グラファイトデザイン"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'グラファイトデザイン', 'DR',   2, 0.45, 10, 'グラファイトデザイン DR'),
('シャフト', 'グラファイトデザイン', 'FW',   2, 0.45, 10, 'グラファイトデザイン FW'),
('シャフト', 'グラファイトデザイン', 'UT',   2, 0.45, 10, 'グラファイトデザイン UT');

-- ============================================================
-- シャフト / 三菱ケミカル → 三菱ケミカル株式会社 (id=3)
-- DR=0.45 FW=0.45 UT=0.45 IR=0.45
-- DBのメーカー名: "三菱ケミカル", "三菱"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', '三菱ケミカル', 'DR',   3, 0.45, 10, '三菱ケミカル DR'),
('シャフト', '三菱ケミカル', 'FW',   3, 0.45, 10, '三菱ケミカル FW'),
('シャフト', '三菱ケミカル', 'UT',   3, 0.45, 10, '三菱ケミカル UT'),
('シャフト', '三菱ケミカル', 'IRON', 3, 0.45, 10, '三菱ケミカル IR'),
-- 表記揺れ "三菱" も同一ルール（優先度同じ）
('シャフト', '三菱', 'DR',   3, 0.45, 10, '三菱 DR（三菱ケミカル）'),
('シャフト', '三菱', 'FW',   3, 0.45, 10, '三菱 FW（三菱ケミカル）'),
('シャフト', '三菱', 'UT',   3, 0.45, 10, '三菱 UT（三菱ケミカル）'),
('シャフト', '三菱', 'IRON', 3, 0.45, 10, '三菱 IR（三菱ケミカル）');

-- ============================================================
-- シャフト / USTマミヤ系 → UST Mamiya (id=4)
-- アッタス系: DR=0.45 FW=0.45 UT=0.45 IR=0.45
-- オーガ系:   DR=0.40（FWなし）
-- オーガG系:  DR=0.40 FW=0.45
-- 商品名でのクラブタイプ区別は困難なため、
-- 表記揺れ別にDEFAULT掛率を統一設定（エクセル最小値 0.40）
-- DBのメーカー名: "UST", "UST Mamiya", "UST マミヤ", "USTマミヤ", "マミヤ・オーピー"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
-- "UST" （最も短い表記）
('シャフト', 'UST', 'DR',   4, 0.45, 10, 'UST DR'),
('シャフト', 'UST', 'FW',   4, 0.45, 10, 'UST FW'),
('シャフト', 'UST', 'UT',   4, 0.45, 10, 'UST UT'),
('シャフト', 'UST', 'IRON', 4, 0.45, 10, 'UST IR'),
-- "UST Mamiya" （半角スペース）
('シャフト', 'UST Mamiya', 'DR',   4, 0.45, 10, 'UST Mamiya DR'),
('シャフト', 'UST Mamiya', 'FW',   4, 0.45, 10, 'UST Mamiya FW'),
('シャフト', 'UST Mamiya', 'UT',   4, 0.45, 10, 'UST Mamiya UT'),
('シャフト', 'UST Mamiya', 'IRON', 4, 0.45, 10, 'UST Mamiya IR'),
-- "UST マミヤ" （全角スペース）
('シャフト', 'UST マミヤ', 'DR',   4, 0.45, 10, 'UST マミヤ DR'),
('シャフト', 'UST マミヤ', 'FW',   4, 0.45, 10, 'UST マミヤ FW'),
('シャフト', 'UST マミヤ', 'UT',   4, 0.45, 10, 'UST マミヤ UT'),
('シャフト', 'UST マミヤ', 'IRON', 4, 0.45, 10, 'UST マミヤ IR'),
-- "USTマミヤ" （スペースなし）
('シャフト', 'USTマミヤ', 'DR',   4, 0.45, 10, 'USTマミヤ DR'),
('シャフト', 'USTマミヤ', 'FW',   4, 0.45, 10, 'USTマミヤ FW'),
('シャフト', 'USTマミヤ', 'UT',   4, 0.45, 10, 'USTマミヤ UT'),
('シャフト', 'USTマミヤ', 'IRON', 4, 0.45, 10, 'USTマミヤ IR'),
-- "マミヤ・オーピー"
('シャフト', 'マミヤ・オーピー', 'DR',   4, 0.45, 10, 'マミヤ・オーピー DR'),
('シャフト', 'マミヤ・オーピー', 'FW',   4, 0.45, 10, 'マミヤ・オーピー FW'),
('シャフト', 'マミヤ・オーピー', 'UT',   4, 0.45, 10, 'マミヤ・オーピー UT'),
('シャフト', 'マミヤ・オーピー', 'IRON', 4, 0.45, 10, 'マミヤ・オーピー IR');

-- ============================================================
-- シャフト / トライファス → ワークス (id=7)
-- DR=0.45 FW=0.45 UT=0.45
-- DBのメーカー名: "トライファス"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'トライファス', 'DR',   7, 0.45, 10, 'トライファス DR'),
('シャフト', 'トライファス', 'FW',   7, 0.45, 10, 'トライファス FW'),
('シャフト', 'トライファス', 'UT',   7, 0.45, 10, 'トライファス UT');

-- ============================================================
-- シャフト / アーチ → アーチ (id=8)
-- DR=0.50 FW=0.50 UT=0.50
-- DBのメーカー名: "ARCH", "Arch", "Arch/ARCH"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'ARCH',      'DR',   8, 0.50, 10, 'ARCH DR'),
('シャフト', 'ARCH',      'FW',   8, 0.50, 10, 'ARCH FW'),
('シャフト', 'ARCH',      'UT',   8, 0.50, 10, 'ARCH UT'),
('シャフト', 'Arch',      'DR',   8, 0.50, 10, 'Arch DR'),
('シャフト', 'Arch',      'FW',   8, 0.50, 10, 'Arch FW'),
('シャフト', 'Arch',      'UT',   8, 0.50, 10, 'Arch UT'),
('シャフト', 'Arch/ARCH', 'DR',   8, 0.50, 10, 'Arch/ARCH DR'),
('シャフト', 'Arch/ARCH', 'FW',   8, 0.50, 10, 'Arch/ARCH FW'),
('シャフト', 'Arch/ARCH', 'UT',   8, 0.50, 10, 'Arch/ARCH UT');

-- ============================================================
-- シャフト / CRAZY → CRAZY（ニューアートスポーツ）(id=9)
-- DR=0.40 FW=0.50 UT=0.50
-- DBのメーカー名: "CRAZY"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'CRAZY', 'DR',   9, 0.40, 10, 'CRAZY DR'),
('シャフト', 'CRAZY', 'FW',   9, 0.50, 10, 'CRAZY FW'),
('シャフト', 'CRAZY', 'UT',   9, 0.50, 10, 'CRAZY UT');

-- ============================================================
-- シャフト / ループ(シンカグラファイト) → シンカグラファイト（ループ）(id=10)
-- DR=0.55 FW=0.55 UT=0.55
-- DBのメーカー名: "シンカグラファイト"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'シンカグラファイト', 'DR',   10, 0.55, 10, 'シンカグラファイト(ループ) DR'),
('シャフト', 'シンカグラファイト', 'FW',   10, 0.55, 10, 'シンカグラファイト(ループ) FW'),
('シャフト', 'シンカグラファイト', 'UT',   10, 0.55, 10, 'シンカグラファイト(ループ) UT');

-- ============================================================
-- シャフト / コンポジットテクノ → コンポジットテクノ (id=11)
-- DR=0.45 FW=0.45
-- DBのメーカー名: "コンポジットテクノ"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'コンポジットテクノ', 'DR', 11, 0.45, 10, 'コンポジットテクノ DR'),
('シャフト', 'コンポジットテクノ', 'FW', 11, 0.45, 10, 'コンポジットテクノ FW');

-- ============================================================
-- シャフト / TRPX → TRPX (id=12)
-- DR=0.50 FW=0.50 UT=0.50
-- DBのメーカー名: "TRPX", "trpx", "trpx/TRPX"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'TRPX',      'DR',   12, 0.50, 10, 'TRPX DR'),
('シャフト', 'TRPX',      'FW',   12, 0.50, 10, 'TRPX FW'),
('シャフト', 'TRPX',      'UT',   12, 0.50, 10, 'TRPX UT'),
('シャフト', 'trpx',      'DR',   12, 0.50, 10, 'trpx DR'),
('シャフト', 'trpx',      'FW',   12, 0.50, 10, 'trpx FW'),
('シャフト', 'trpx',      'UT',   12, 0.50, 10, 'trpx UT'),
('シャフト', 'trpx/TRPX', 'DR',   12, 0.50, 10, 'trpx/TRPX DR'),
('シャフト', 'trpx/TRPX', 'FW',   12, 0.50, 10, 'trpx/TRPX FW'),
('シャフト', 'trpx/TRPX', 'UT',   12, 0.50, 10, 'trpx/TRPX UT');

-- ============================================================
-- シャフト / REVE → REVE (id=13)
-- DR=0.65 FW=0.65 UT=0.65
-- DBのメーカー名: "REVE"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'REVE', 'DR',   13, 0.65, 10, 'REVE DR'),
('シャフト', 'REVE', 'FW',   13, 0.65, 10, 'REVE FW'),
('シャフト', 'REVE', 'UT',   13, 0.65, 10, 'REVE UT');

-- ============================================================
-- シャフト / オリンピック → ラストストローク (id=14)
-- DR=0.50
-- DBのメーカー名: "オリムピック"（表記ゆれ）
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'オリムピック', 'DR', 14, 0.50, 10, 'オリムピック DR（ラストストローク経由）');

-- ============================================================
-- シャフト / 日本シャフト → 日本シャフト (id=15)
-- DR=0.518
-- DBのメーカー名: "日本シャフト", "日本"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', '日本シャフト', 'DR',   15, 0.518, 10, '日本シャフト DR'),
('シャフト', '日本シャフト', 'FW',   15, 0.518, 10, '日本シャフト FW'),
('シャフト', '日本シャフト', 'UT',   15, 0.518, 10, '日本シャフト UT'),
('シャフト', '日本シャフト', 'IRON', 15, 0.518, 10, '日本シャフト IR'),
-- 表記揺れ "日本"
('シャフト', '日本', 'DR',   15, 0.518, 10, '日本シャフト DR（短縮表記）'),
('シャフト', '日本', 'FW',   15, 0.518, 10, '日本シャフト FW（短縮表記）'),
('シャフト', '日本', 'UT',   15, 0.518, 10, '日本シャフト UT（短縮表記）'),
('シャフト', '日本', 'IRON', 15, 0.518, 10, '日本シャフト IR（短縮表記）');

-- ============================================================
-- シャフト / デザインチューニング → 仕入先未定（直接？）
-- エクセル掛率: メビウス=0.45, エッジ=0.45, ゼロ=0.50
-- 仕入先IDなし→現時点ではルール未登録（仕入先確定後に追加）
-- DBのメーカー名: "デザインチューニング"
-- ============================================================
-- （仕入先未確定のためスキップ）

-- ============================================================
-- シャフト / ムジーク → 仕入先未定（直接？）
-- エクセル掛率: バンブー=0.55, ドガッティ=0.50, ターフライダー=0.50
-- DBのメーカー名: "muziik"
-- ============================================================
-- （仕入先未確定のためスキップ）

-- ============================================================
-- シャフト / グラヴィティ → 仕入先未定（直接？）
-- エクセル掛率: 全=0.60
-- DBのメーカー名: "グラヴィティ"
-- ============================================================
-- （仕入先未確定のためスキップ）

-- ============================================================
-- ヘッド / キャロウェイ → 朝日ゴルフ (id=16)
-- DBのメーカー名: "キャロウェイ", "CALLAWAY"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('ヘッド', 'キャロウェイ', NULL, 16, NULL, 10, 'キャロウェイ → 朝日ゴルフ'),
('ヘッド', 'CALLAWAY',     NULL, 16, NULL, 10, 'CALLAWAY → 朝日ゴルフ');

-- ============================================================
-- ヘッド / テーラーメイド → 朝日ゴルフ (id=16)
-- DBのメーカー名: "テーラーメイド"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('ヘッド', 'テーラーメイド', NULL, 16, NULL, 10, 'テーラーメイド → 朝日ゴルフ');

-- ============================================================
-- ヘッド / タイトリスト → アクシネットジャパン (id=17)
-- DBのメーカー名: "タイトリスト"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('ヘッド', 'タイトリスト', NULL, 17, NULL, 10, 'タイトリスト ヘッド → アクシネット');

-- ============================================================
-- ヘッド / COBRA → プーマジャパン（COBRA）(id=18)
-- DBのメーカー名: （ヘッドカテゴリに"COBRA"はないが念のため設定）
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('ヘッド', 'COBRA', NULL, 18, NULL, 10, 'COBRA → プーマジャパン');

-- ============================================================
-- ボール / タイトリスト → アクシネットジャパン (id=17)
-- DBのメーカー名: "タイトリスト"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('ボール', 'タイトリスト', NULL, 17, NULL, 10, 'タイトリスト ボール → アクシネット');

-- ============================================================
-- ボール / ブリジストン → ヤトゴルフ (id=19)
-- DBのメーカー名: "ブリジストン", "スリクソン"（同社グループ）
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('ボール', 'ブリジストン', NULL, 19, NULL, 10, 'ブリジストン ボール → ヤトゴルフ'),
('ボール', 'スリクソン',   NULL, 19, NULL, 10, 'スリクソン ボール → ヤトゴルフ');

-- ============================================================
-- グリップ / iomic → イオミック (id=20)
-- DR=0.58（グリップなのでclob_typeはNULL）
-- DBのメーカー名: "IOMIC", "イオミック"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('グリップ', 'IOMIC',   NULL, 20, 0.58, 10, 'IOMIC → イオミック'),
('グリップ', 'イオミック', NULL, 20, 0.58, 10, 'イオミック');

-- ============================================================
-- グリップ / GOLF PRIDE → ワークス (id=7)
-- DBのメーカー名: "GOLF PRIDE"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('グリップ', 'GOLF PRIDE', NULL, 7, NULL, 10, 'GOLF PRIDE → ワークス');

-- ============================================================
-- グリップ / PERFECT PRO → ワークス (id=7)
-- DBのメーカー名: "perfect pro"（小文字）
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('グリップ', 'perfect pro',  NULL, 7, NULL, 10, 'perfect pro → ワークス'),
('グリップ', 'PERFECT PRO',  NULL, 7, NULL, 10, 'PERFECT PRO → ワークス');

-- ============================================================
-- グリップ / CADERO → ワークス (id=7)
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('グリップ', 'CADERO', NULL, 7, NULL, 10, 'CADERO → ワークス');

-- ============================================================
-- グリップ / STM → STM (id=21)
-- DBのメーカー名: "STM"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('グリップ', 'STM', NULL, 21, NULL, 10, 'STM グリップ → STM');

-- ============================================================
-- グローブ / フォーサリンクス → 株式会社シンカグラファイト（グローブ）(id=22)
-- DBに"フォーサリンクス"というメーカーは未確認→要確認
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('グローブ', 'フォーサリンクス', NULL, 22, NULL, 10, 'フォーサリンクス → シンカグラファイト(グローブ)');

-- ============================================================
-- グローブ / ZERO FIT → ヤトゴルフ（ZERO FIT）(id=23)
-- DBのメーカー名: "ZERO FIT"
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('グローブ', 'ZERO FIT', NULL, 23, NULL, 10, 'ZERO FIT → ヤトゴルフ(ZERO FIT)');

-- ============================================================
-- パターグリップ / 各メーカー（グリップと同じ仕入先）
-- ============================================================
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('パターグリップ', 'IOMIC',   NULL, 20, 0.58, 10, 'IOMIC パターグリップ → イオミック'),
('パターグリップ', 'イオミック', NULL, 20, 0.58, 10, 'イオミック パターグリップ'),
('パターグリップ', 'STM',      NULL, 21, NULL, 10, 'STM パターグリップ → STM');

-- 結果確認
SELECT COUNT(*) AS total_rules FROM supplier_rules;

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------
-- 0005_works_supplier_rules.sql
-- ----------------------------------------------------------------
-- ============================================================
-- ワークス経由メーカーのルール修正・追加
-- 対象: フジクラ / 日本シャフト / 三菱ケミカル / USTマミヤ /
--       トライファス / ムジーク / デザインチューニング / グラビティー
-- ワークス supplier_id = 7
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ① フジクラ → ワークス に変更（全種類）
DELETE FROM supplier_rules WHERE manufacturer = 'フジクラ';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'フジクラ', 'DR',   7, 0.45, 10, 'フジクラ DR → ワークス'),
('シャフト', 'フジクラ', 'FW',   7, 0.45, 10, 'フジクラ FW → ワークス'),
('シャフト', 'フジクラ', 'UT',   7, 0.45, 10, 'フジクラ UT → ワークス'),
('シャフト', 'フジクラ', 'IRON', 7, 0.50, 10, 'フジクラ IR → ワークス');

-- ② 日本シャフト → ワークス に変更（全種類・表記揺れ含む）
DELETE FROM supplier_rules WHERE manufacturer IN ('日本シャフト', '日本');
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', '日本シャフト', 'DR',   7, 0.518, 10, '日本シャフト DR → ワークス'),
('シャフト', '日本シャフト', 'FW',   7, 0.518, 10, '日本シャフト FW → ワークス'),
('シャフト', '日本シャフト', 'UT',   7, 0.518, 10, '日本シャフト UT → ワークス'),
('シャフト', '日本シャフト', 'IRON', 7, 0.518, 10, '日本シャフト IR → ワークス'),
('シャフト', '日本',         'DR',   7, 0.518, 10, '日本シャフト DR → ワークス（短縮）'),
('シャフト', '日本',         'FW',   7, 0.518, 10, '日本シャフト FW → ワークス（短縮）'),
('シャフト', '日本',         'UT',   7, 0.518, 10, '日本シャフト UT → ワークス（短縮）'),
('シャフト', '日本',         'IRON', 7, 0.518, 10, '日本シャフト IR → ワークス（短縮）');

-- ③ 三菱ケミカル → ワークス に変更（全種類・表記揺れ含む）
DELETE FROM supplier_rules WHERE manufacturer IN ('三菱ケミカル', '三菱');
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', '三菱ケミカル', 'DR',   7, 0.45, 10, '三菱ケミカル DR → ワークス'),
('シャフト', '三菱ケミカル', 'FW',   7, 0.45, 10, '三菱ケミカル FW → ワークス'),
('シャフト', '三菱ケミカル', 'UT',   7, 0.45, 10, '三菱ケミカル UT → ワークス'),
('シャフト', '三菱ケミカル', 'IRON', 7, 0.45, 10, '三菱ケミカル IR → ワークス'),
('シャフト', '三菱',         'DR',   7, 0.45, 10, '三菱ケミカル DR → ワークス（短縮）'),
('シャフト', '三菱',         'FW',   7, 0.45, 10, '三菱ケミカル FW → ワークス（短縮）'),
('シャフト', '三菱',         'UT',   7, 0.45, 10, '三菱ケミカル UT → ワークス（短縮）'),
('シャフト', '三菱',         'IRON', 7, 0.45, 10, '三菱ケミカル IR → ワークス（短縮）');

-- ④ USTマミヤ → ワークス に変更（全表記揺れ）
DELETE FROM supplier_rules WHERE manufacturer IN ('UST', 'UST Mamiya', 'UST マミヤ', 'USTマミヤ', 'マミヤ・オーピー');
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'UST Mamiya', 'DR',   7, 0.45, 10, 'UST Mamiya DR → ワークス'),
('シャフト', 'UST Mamiya', 'FW',   7, 0.45, 10, 'UST Mamiya FW → ワークス'),
('シャフト', 'UST Mamiya', 'UT',   7, 0.45, 10, 'UST Mamiya UT → ワークス'),
('シャフト', 'UST Mamiya', 'IRON', 7, 0.45, 10, 'UST Mamiya IR → ワークス'),
('シャフト', 'USTマミヤ',   'DR',   7, 0.45, 10, 'USTマミヤ DR → ワークス'),
('シャフト', 'USTマミヤ',   'FW',   7, 0.45, 10, 'USTマミヤ FW → ワークス'),
('シャフト', 'USTマミヤ',   'UT',   7, 0.45, 10, 'USTマミヤ UT → ワークス'),
('シャフト', 'USTマミヤ',   'IRON', 7, 0.45, 10, 'USTマミヤ IR → ワークス'),
('シャフト', 'UST',         'DR',   7, 0.45, 10, 'UST DR → ワークス'),
('シャフト', 'UST',         'FW',   7, 0.45, 10, 'UST FW → ワークス'),
('シャフト', 'UST',         'UT',   7, 0.45, 10, 'UST UT → ワークス'),
('シャフト', 'UST',         'IRON', 7, 0.45, 10, 'UST IR → ワークス'),
('シャフト', 'マミヤ・オーピー', 'DR',   7, 0.45, 10, 'マミヤ DR → ワークス'),
('シャフト', 'マミヤ・オーピー', 'FW',   7, 0.45, 10, 'マミヤ FW → ワークス'),
('シャフト', 'マミヤ・オーピー', 'UT',   7, 0.45, 10, 'マミヤ UT → ワークス'),
('シャフト', 'マミヤ・オーピー', 'IRON', 7, 0.45, 10, 'マミヤ IR → ワークス');

-- ⑤ トライファス → ワークス（既存を念のり再設定）
DELETE FROM supplier_rules WHERE manufacturer = 'トライファス';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'トライファス', 'DR',   7, 0.45, 10, 'トライファス DR → ワークス'),
('シャフト', 'トライファス', 'FW',   7, 0.45, 10, 'トライファス FW → ワークス'),
('シャフト', 'トライファス', 'UT',   7, 0.45, 10, 'トライファス UT → ワークス'),
('シャフト', 'トライファス', 'IRON', 7, 0.45, 10, 'トライファス IR → ワークス');

-- ⑥ ムジーク（各シリーズ）→ ワークス（新規追加）
DELETE FROM supplier_rules WHERE manufacturer LIKE 'ムジーク%';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'ムジーク',             'DR',   7, NULL, 10, 'ムジーク DR → ワークス'),
('シャフト', 'ムジーク',             'FW',   7, NULL, 10, 'ムジーク FW → ワークス'),
('シャフト', 'ムジーク',             'UT',   7, NULL, 10, 'ムジーク UT → ワークス'),
('シャフト', 'ムジーク',             'IRON', 7, NULL, 10, 'ムジーク IR → ワークス'),
('シャフト', 'ムジーク バンブー',     'DR',   7, NULL, 10, 'ムジーク バンブー DR → ワークス'),
('シャフト', 'ムジーク バンブー',     'FW',   7, NULL, 10, 'ムジーク バンブー FW → ワークス'),
('シャフト', 'ムジーク バンブー',     'UT',   7, NULL, 10, 'ムジーク バンブー UT → ワークス'),
('シャフト', 'ムジーク ドガッティ',   'DR',   7, NULL, 10, 'ムジーク ドガッティ DR → ワークス'),
('シャフト', 'ムジーク ドガッティ',   'FW',   7, NULL, 10, 'ムジーク ドガッティ FW → ワークス'),
('シャフト', 'ムジーク ドガッティ',   'UT',   7, NULL, 10, 'ムジーク ドガッティ UT → ワークス'),
('シャフト', 'ムジーク ターフライダー','DR',   7, NULL, 10, 'ムジーク ターフライダー DR → ワークス'),
('シャフト', 'ムジーク ターフライダー','FW',   7, NULL, 10, 'ムジーク ターフライダー FW → ワークス'),
('シャフト', 'ムジーク ターフライダー','UT',   7, NULL, 10, 'ムジーク ターフライダー UT → ワークス');

-- ⑦ デザインチューニング（各シリーズ）→ ワークス（新規追加）
DELETE FROM supplier_rules WHERE manufacturer LIKE 'デザインチューニング%';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'デザインチューニング',          'DR',   7, NULL, 10, 'DT DR → ワークス'),
('シャフト', 'デザインチューニング',          'FW',   7, NULL, 10, 'DT FW → ワークス'),
('シャフト', 'デザインチューニング',          'UT',   7, NULL, 10, 'DT UT → ワークス'),
('シャフト', 'デザインチューニング',          'IRON', 7, NULL, 10, 'DT IR → ワークス'),
('シャフト', 'デザインチューニング メビウス', 'DR',   7, NULL, 10, 'DT メビウス DR → ワークス'),
('シャフト', 'デザインチューニング メビウス', 'FW',   7, NULL, 10, 'DT メビウス FW → ワークス'),
('シャフト', 'デザインチューニング メビウス', 'UT',   7, NULL, 10, 'DT メビウス UT → ワークス'),
('シャフト', 'デザインチューニング エッジ',   'DR',   7, NULL, 10, 'DT エッジ DR → ワークス'),
('シャフト', 'デザインチューニング エッジ',   'FW',   7, NULL, 10, 'DT エッジ FW → ワークス'),
('シャフト', 'デザインチューニング エッジ',   'UT',   7, NULL, 10, 'DT エッジ UT → ワークス'),
('シャフト', 'デザインチューニング ゼロ',     'DR',   7, NULL, 10, 'DT ゼロ DR → ワークス'),
('シャフト', 'デザインチューニング ゼロ',     'FW',   7, NULL, 10, 'DT ゼロ FW → ワークス'),
('シャフト', 'デザインチューニング ゼロ',     'UT',   7, NULL, 10, 'DT ゼロ UT → ワークス');

-- ⑧ グラビティー（Waccine Compo）→ ワークス（新規追加）
DELETE FROM supplier_rules WHERE manufacturer LIKE 'グラビティー%' OR manufacturer LIKE 'Waccine%';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'グラビティー',              'DR',   7, NULL, 10, 'グラビティー DR → ワークス'),
('シャフト', 'グラビティー',              'FW',   7, NULL, 10, 'グラビティー FW → ワークス'),
('シャフト', 'グラビティー',              'UT',   7, NULL, 10, 'グラビティー UT → ワークス'),
('シャフト', 'グラビティー',              'IRON', 7, NULL, 10, 'グラビティー IR → ワークス'),
('シャフト', 'Waccine Compo',            'DR',   7, NULL, 10, 'Waccine DR → ワークス'),
('シャフト', 'Waccine Compo',            'FW',   7, NULL, 10, 'Waccine FW → ワークス'),
('シャフト', 'Waccine Compo',            'UT',   7, NULL, 10, 'Waccine UT → ワークス'),
('シャフト', 'Waccine Compo',            'IRON', 7, NULL, 10, 'Waccine IR → ワークス'),
('シャフト', 'グラビティー（Waccine Compo）', 'DR',   7, NULL, 10, 'グラビティー DR → ワークス'),
('シャフト', 'グラビティー（Waccine Compo）', 'FW',   7, NULL, 10, 'グラビティー FW → ワークス'),
('シャフト', 'グラビティー（Waccine Compo）', 'UT',   7, NULL, 10, 'グラビティー UT → ワークス'),
('シャフト', 'グラビティー（Waccine Compo）', 'IRON', 7, NULL, 10, 'グラビティー IR → ワークス');

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------
-- 0006_excel_update.sql
-- ----------------------------------------------------------------
-- ============================================================
-- Excelデータをもとに仕入先情報・supplier_rulesを更新
-- 2026-05-22
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ① suppliers の notes / shipping_rule を更新（備考欄）
UPDATE suppliers SET
  notes = '2万5千円以内は送料別途',
  shipping_rule = '¥25,000以内送料別途'
WHERE id = 7; -- ワークス

UPDATE suppliers SET
  notes = NULL,
  shipping_rule = NULL
WHERE id = 8; -- アーチ

UPDATE suppliers SET
  notes = 'ログインid：s_furukawa@fine-d.co.jp / PASS：golfwinggd',
  shipping_rule = '¥20,000以上送料無料'
WHERE id = 2; -- グラファイトデザイン

UPDATE suppliers SET
  notes = NULL,
  shipping_rule = NULL
WHERE id = 9; -- CRAZY

UPDATE suppliers SET
  notes = '辻垣内社長：080-1027-7942 / 在庫確認：090-9118-3388 辻中様',
  shipping_rule = NULL
WHERE id = 10; -- シンカグラファイト（ループ）

UPDATE suppliers SET
  notes = '税込20,000未満 送料¥1,200',
  shipping_rule = '¥20,000未満 送料¥1,200'
WHERE id = 11; -- コンポジットテクノ

UPDATE suppliers SET
  notes = '¥30,000未満 送料¥1,500',
  shipping_rule = '¥30,000未満 送料¥1,500'
WHERE id = 12; -- TRPX

UPDATE suppliers SET
  notes = '手数料、送料別途',
  shipping_rule = '送料・手数料別途'
WHERE id = 13; -- REVE

UPDATE suppliers SET
  notes = 'y-yamamoto@olympic-co-ltd.jp / 在庫確認サイト: https://olympic-co-ltd.jp/golf/stock/g_login.php / ログイン:095428 / パスワード:095428',
  shipping_rule = NULL
WHERE id = 14; -- ラストストローク

UPDATE suppliers SET
  notes = '25,000以下は送料1,000円 / callcenter@asahigolf.co.jp',
  shipping_rule = '¥25,000以下 送料¥1,000'
WHERE id = 16; -- 朝日ゴルフ

UPDATE suppliers SET
  notes = '目川様 070-1278-3426 / masaaki_egawa@acushnetgolf.com / ボール担当：船橋様 080-7499-1691 / Atsunobu_Funahashi@acushnetgolf.com',
  shipping_rule = NULL
WHERE id = 17; -- アクシネットジャパン

UPDATE suppliers SET
  notes = NULL,
  shipping_rule = NULL
WHERE id = 18; -- プーマジャパン（COBRA）

UPDATE suppliers SET
  notes = NULL,
  shipping_rule = NULL
WHERE id = 19; -- ヤトゴルフ

UPDATE suppliers SET
  notes = '紙の注文票あり / ¥11,000未満送料別途',
  shipping_rule = '¥11,000未満送料別途'
WHERE id = 20; -- イオミック

UPDATE suppliers SET
  notes = '¥15,000以下送料別途',
  shipping_rule = '¥15,000以下送料別途'
WHERE id = 21; -- STM

UPDATE suppliers SET
  notes = '紙の注文票あり / 20,000円以下送料別途',
  shipping_rule = '¥20,000以下送料別途'
WHERE id = 22; -- 株式会社シンカグラファイト（グローブ）

-- エリートグリップ（新規登録）
INSERT OR IGNORE INTO suppliers (name, contact_name, order_method, payment_method, notes, shipping_rule, is_active)
VALUES ('エリートグリップ', NULL, 'LINE', NULL, '古川に連絡 / 20,000円未満送料別途', '¥20,000未満送料別途', 1);

-- ② supplier_rules の掛率をExcelの値に更新

-- フジクラ：DR/FW/UT=0.45, IRON=0.50（変更なし）
-- 三菱ケミカル：全0.45（変更なし）
-- USTマミヤ：全0.45（変更なし）
-- トライファス：全0.45（変更なし）
-- デザインチューニング：全0.50
UPDATE supplier_rules SET rate = 0.50 WHERE manufacturer IN ('デザインチューニング','デザインチューニング メビウス','デザインチューニング エッジ','デザインチューニング ゼロ');

-- ムジーク：DR=0.55 のみ（FW/UTはNull）
UPDATE supplier_rules SET rate = 0.55 WHERE manufacturer LIKE 'ムジーク%' AND club_type = 'DR';
UPDATE supplier_rules SET rate = NULL WHERE manufacturer LIKE 'ムジーク%' AND club_type IN ('FW','UT','IRON');

-- 日本シャフト：全0.51818182
UPDATE supplier_rules SET rate = 0.51818182 WHERE manufacturer IN ('日本シャフト','日本');

-- グラビティー：全0.60
UPDATE supplier_rules SET rate = 0.60 WHERE manufacturer LIKE 'グラビティー%' OR manufacturer LIKE 'Waccine%';

-- アーチ：DR/FW/UT=0.50
UPDATE supplier_rules SET rate = 0.50 WHERE manufacturer IN ('ARCH','Arch','Arch/ARCH','アーチ');

-- グラファイトデザイン：DR/FW/UT=0.45
UPDATE supplier_rules SET rate = 0.45 WHERE manufacturer = 'グラファイトデザイン';

-- CRAZY：DR=0.40, FW/UT=0.50（変更なし）

-- ループ（シンカグラファイト）：DR/FW/UT=0.55
UPDATE supplier_rules SET rate = 0.55 WHERE manufacturer IN ('シンカグラファイト','ループ');

-- コンポジットテクノ：DR/FW/UT=0.45（変更なし）

-- TRPX：DR/FW/UT=0.50（変更なし）

-- REVE：DR/FW/UT=0.65（変更なし）

-- オリンピック（オリムピック）：DR/FW/UT=0.50
UPDATE supplier_rules SET rate = 0.50 WHERE manufacturer IN ('オリムピック','オリンピック');

-- ③ ループのメーカー表記「ループ」をsupplier_rulesに追加
INSERT OR IGNORE INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes)
SELECT 'シャフト', 'ループ', club_type, supplier_id, 0.55, priority, 'ループ → シンカグラファイト（ループ）'
FROM supplier_rules WHERE manufacturer = 'シンカグラファイト' AND club_type IS NOT NULL
ON CONFLICT DO NOTHING;

-- ④ エリートグリップをsupplier_rulesに追加
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes)
SELECT 'グリップ', 'エリート', NULL,
  (SELECT id FROM suppliers WHERE name='エリートグリップ' LIMIT 1),
  NULL, 10, 'エリート → エリートグリップ'
WHERE NOT EXISTS (SELECT 1 FROM supplier_rules WHERE manufacturer='エリート');

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------
-- 0010_purchase_pool.sql
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 0011_multi_tenant.sql
-- ----------------------------------------------------------------
-- ============================================================
-- マルチテナント対応マイグレーション
-- tenant_id=0: デモテナント（毎日リセット）
-- tenant_id=1: golfwing（既存データ）
-- ============================================================

-- ── テナント管理テーブル ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,          -- 会社名
  slug        TEXT    UNIQUE NOT NULL,   -- 識別子（URLスラッグ等で将来利用）
  is_demo     INTEGER NOT NULL DEFAULT 0,-- 1=デモテナント
  app_name    TEXT,                      -- システム表示名（NULL時はデフォルト）
  created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 初期テナント投入
INSERT OR IGNORE INTO tenants (id, name, slug, is_demo, app_name)
VALUES
  (0, 'デモ',          'demo',      1, 'デモ - 発注管理システム'),
  (1, 'ゴルフウィング', 'golfwing',  0, 'ゴルフウィング 発注管理');

-- ── ユーザー管理テーブル ──────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL,
  username      TEXT    NOT NULL,
  password      TEXT    NOT NULL,   -- プレーンテキスト（既存方式を踏襲）
  display_name  TEXT,               -- 表示名
  is_admin      INTEGER DEFAULT 0,
  created_at    TEXT    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, username),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- 初期ユーザー投入（既存認証情報を引き継ぎ）
-- ※ パスワードは Cloudflare の環境変数 AUTH_PASSWORD と同じ値に手動で変更すること
INSERT OR IGNORE INTO users (tenant_id, username, password, display_name, is_admin)
VALUES
  (0, 'demo',  'demo1234',    'デモユーザー', 0),
  (1, 'admin', 'golfwing2024', '管理者',       1);

-- ── 既存テーブルに tenant_id カラムを追加 ─────────────────
-- suppliers
ALTER TABLE suppliers        ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1;
-- products
ALTER TABLE products         ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1;
-- supplier_rules
ALTER TABLE supplier_rules   ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1;
-- purchase_orders
ALTER TABLE purchase_orders  ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1;
-- receipts（purchase_order_id経由で追跡できるが直接持つ方がクエリ効率良い）
ALTER TABLE receipts         ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1;

-- ── インデックス追加 ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant       ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant        ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_rules_tenant  ON supplier_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_receipts_tenant        ON receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant           ON users(tenant_id);

-- ----------------------------------------------------------------
-- 0012_supplier_cc_emails.sql
-- ----------------------------------------------------------------
-- 仕入先ごとのCCアドレス帳
-- suppliers.cc_emails: カンマ区切りで複数CC設定可能
ALTER TABLE suppliers ADD COLUMN cc_emails TEXT;

-- ----------------------------------------------------------------
-- 0013_product_suppliers.sql
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 0014_receipt_slip_check.sql
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 0015_receipt_items_actual_price.sql
-- ----------------------------------------------------------------
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

