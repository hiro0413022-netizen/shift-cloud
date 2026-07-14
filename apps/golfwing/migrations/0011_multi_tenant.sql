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
