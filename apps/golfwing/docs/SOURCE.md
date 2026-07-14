# SOURCE.md — ソースコード構成解析

> **最終更新**: 2026-06-25

---

## 1. ディレクトリ構成

```
/home/user/webapp/
├── src/                          # TypeScript バックエンドソース
│   ├── index.tsx                 # アプリエントリーポイント (389行)
│   │                             # - Honoアプリ初期化
│   │                             # - 認証ミドルウェア
│   │                             # - 静的ファイル配信
│   │                             # - デモデータリセット(Cron)
│   │                             # - resetDemoData() 関数
│   ├── auth.ts                   # 認証モジュール (435行)
│   │                             # - HMAC-SHA256署名付きトークン
│   │                             # - Cookie管理
│   │                             # - ログイン・ログアウト処理
│   │                             # - ログインページHTML生成
│   ├── xlsxHelper.ts             # Excel出力ヘルパー
│   │                             # - .xlsx ファイル生成（外部ライブラリ不使用）
│   │                             # - OOXML形式のバイナリ生成
│   └── routes/
│       ├── api.ts                # APIルート (2544行)
│       │                         # - 52エンドポイント
│       │                         # - JSON APIすべて
│       │                         # - デモモード書き込みブロックmiddleware
│       │                         # - supplier判定ロジック(resolveSupplier)
│       │                         # - Excel出力(buildXlsx呼び出し)
│       ├── pages.ts              # ページルート (5106行)
│       │                         # - 17ページ（SSR HTML生成）
│       │                         # - Bootstrap 5 + Font Awesome CDN
│       │                         # - インラインCSS・JS
│       ├── landing.ts            # ランディングページ
│       │                         # - 未ログイン時の / ページ
│       │                         # - 機能紹介・デモ誘導
│       └── api.ts.bak            # api.ts バックアップ（削除推奨）
│
├── public/                       # 静的ファイル（ブラウザ直接配信）
│   └── static/
│       ├── new-order.js          # 新規発注フォームJS (1102行)
│       │                         # - 動的行追加
│       │                         # - Ajax商品補完
│       │                         # - 仕入先自動判定（product_suppliers → supplier_rules）
│       │                         # - 掛け率×定価=仕入単価 自動計算
│       │                         # - Enterキー誤送信防止
│       └── products-page.js      # 商品マスタページJS (690行)
│                                 # - 複数仕入先管理モーダル
│                                 # - モーダルAjax操作（追加・削除・デフォルト設定）
│
├── migrations/                   # D1マイグレーションSQL
│   ├── 0001_initial_schema.sql   # 初期スキーマ
│   ├── 0002_suppliers_order_method.sql
│   ├── 0003_performance_indexes.sql
│   ├── 0004_supplier_rules.sql   # 本番仕入先ルールデータ投入
│   ├── 0005_works_supplier_rules.sql
│   ├── 0006_excel_update.sql
│   ├── 0010_purchase_pool.sql
│   ├── 0011_multi_tenant.sql
│   ├── 0012_supplier_cc_emails.sql
│   └── 0013_product_suppliers.sql
│
├── dist/                         # ビルド出力（Git管理外）
│   ├── _worker.js                # バンドル済みWorker (356.85 kB)
│   ├── static/                   # バンドル済み静的ファイル
│   └── _routes.json              # Cloudflare Pages ルーティング設定
│
├── docs/                         # YOZAN Genesisドキュメント（このフォルダ）
│
├── node_modules/                 # 依存ライブラリ（Git管理外）
│
├── package.json                  # 依存関係・スクリプト定義
├── tsconfig.json                 # TypeScript設定（JSX: hono/jsx）
├── vite.config.ts                # Viteビルド設定（@hono/vite-build使用）
├── wrangler.jsonc                # Cloudflare Wrangler設定（D1バインディング）
├── ecosystem.config.cjs          # PM2設定（Sandbox用開発サーバー）
├── HANDOVER.md                   # 開発引き継ぎドキュメント
└── .gitignore                    # Git除外設定
```

---

## 2. 各ファイルの役割詳細

### `src/index.tsx` — エントリーポイント

```typescript
// 責務:
// 1. Honoアプリ初期化・型定義(Bindings, Variables)
// 2. 静的ファイル配信 (/static/*)
// 3. 認証不要パス (/login, /demo-login, /static/*, /, /api/demo-reset)
// 4. 認証ミドルウェア（全ルートに sessionUser を c.set()）
// 5. ルートマウント（/api → apiRoutes, / → pageRoutes）
// 6. デモデータ定義（DEMO_SUPPLIERS, DEMO_PRODUCTS, DEMO_ORDERS）
// 7. resetDemoData() 関数（5つのテーブルを順次INSERT）
// 8. Cron Handler (scheduled: 毎日デモリセット)
// 9. ランディングページ (/ → landingPage())
```

**環境変数（Bindings型）**:
```typescript
type Bindings = {
  DB: D1Database
  AUTH_SECRET?: string
  AUTH_USERNAME?: string   // 後方互換
  AUTH_PASSWORD?: string   // 後方互換
  APP_NAME?: string
  APP_SENDER_NAME?: string
  APP_SENDER_SHOP?: string
  APP_SENDER_ADDR?: string
  APP_SENDER_TEL?: string
  APP_SENDER_MAIL?: string
  APP_DEFAULT_CC?: string
  DEMO_MODE?: string
}
```

---

### `src/auth.ts` — 認証モジュール

```typescript
// エクスポート:
export type AuthBindings   // 認証に必要なBindings
export type SessionUser    // セッションユーザー型
export async function createToken()        // トークン生成
export async function verifyToken()        // トークン検証
export function parseCookie()              // Cookieパース
export async function getCurrentUser()     // 現在ユーザー取得
export async function attemptLogin()       // ログイン処理
export function logoutResponse()           // ログアウトレスポンス
export function unauthorizedRedirect()     // 未認証リダイレクト
export function loginPage()                // ログインページHTML生成

// SessionUser型:
type SessionUser = {
  username:    string
  tenantId:    number
  displayName: string
  isDemo:      boolean   // tenant_id===0
  isAdmin:     boolean
}
```

**トークン形式**: `username:tenantId:expires:HMAC署名`  
**TTL**: 7日間 (604800秒)

---

### `src/routes/api.ts` — APIルート

```typescript
// ユーティリティ関数:
function getTenantId()         // c.get('sessionUser').tenantId取得
function senderInfoFromEnv()   // 環境変数から差出人情報取得
function yen()                 // 数値→円表示フォーマット
function statusLabel()         // status英語→日本語変換
function today()               // 今日の日付(YYYY-MM-DD)
function nowCode()             // タイムスタンプコード
function uuid5()               // ランダム5文字ID
function normalize()           // 全角スペース正規化
async function resolveSupplier()  // 仕入先判定ロジック

// 主要な処理パターン:
// 1. 全クエリに tenant_id フィルタ付与
// 2. デモモード書き込みブロック middleware
// 3. メール文面自動生成 (buildEmailBody)
// 4. バッチコード生成 (batch_code = "SupplierNamePrefix-YYYYMMDDHHmmss")
```

**`resolveSupplier()` 関数**（仕入先自動判定）:
1. `product_id` がある場合 → `products.default_supplier_id` を使用
2. `supplier_rules` を `item_category AND manufacturer AND club_type` で検索
3. 優先度（priority）順に最初のマッチを使用

---

### `src/routes/pages.ts` — ページルート

```typescript
// 責務:
// - 17ページのSSR HTML生成
// - Bootstrap 5.3 + Font Awesome 6.4 CDN読み込み
// - 各ページに必要なデータをDBから取得してHTMLに埋め込み
// - `window._SUPPLIERS` 等のグローバル変数でデータをブラウザに渡す
// - インラインCSS・JSを含む大規模な関数
```

**⚠️ 課題**: pages.tsが5106行と非常に大きく、各ページのHTMLがインラインで書かれている。
将来的にはコンポーネント分割（JSXテンプレート化）が必要。

---

### `src/xlsxHelper.ts` — Excel出力

```typescript
// 外部ライブラリを使わずに .xlsx (OOXML) を生成
// - ZIP形式のOOXMLバイナリを手動構築
// - [Content_Types].xml, xl/workbook.xml, xl/worksheets/sheet1.xml 等を生成
// - Cloudflare Workers環境で動作（Node.js fs API不使用）
```

---

### `public/static/new-order.js` — 発注フォームJS

```javascript
// 主要関数:
initNewOrderForm()        // フォーム初期化
addRow()                  // 明細行追加
removeRow()               // 明細行削除
fillRow(tr, product)      // 商品選択時のデータ自動入力
  // └ /api/products/:id/suppliers で仕入先取得
  //   ├ 2件以上 → セレクトBox表示（掛け率付き）
  //   ├ 1件 → hidden + 掛け率自動セット
  //   └ 0件 → suggest-supplier APIにフォールバック（※現在404）
calcUnitPrice(tr)          // 掛け率×定価=仕入単価 計算
submitOrderForm(e, draft)  // 発注/下書き保存送信
submitPoolForm()           // プール登録
// Enterキー防止: form.addEventListener('keydown', ...)
```

---

### `public/static/products-page.js` — 商品マスタJS

```javascript
// 主要関数:
initProductPage()          // ページ初期化（イベントリスナー設定）
loadSupplierList(productId) // /api/product-suppliers/:id でリスト取得・表示
addSupplierRow()            // 仕入先追加送信
deleteSupplierRow(id)       // 仕入先削除（確認ダイアログ）
setDefaultSupplier(id)      // デフォルト仕入先設定
escHtml(s)                  // HTMLエスケープ
```

---

## 3. 依存関係（package.json）

```json
{
  "dependencies": {
    "hono": "^4.12.12"    // Webフレームワーク（唯一のランタイム依存）
  },
  "devDependencies": {
    "@hono/vite-build": "^1.2.0",
    "@hono/vite-dev-server": "^0.18.2",
    "@cloudflare/workers-types": "^4.20250705.0",
    "vite": "^6.3.5",
    "wrangler": "^4.4.0"
  }
}
```

**特徴**: ランタイム依存は `hono` のみ。xlsxHelperも自前実装のため、ビルドサイズが最小化されている。

---

## 4. TypeScript設定

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "types": ["@cloudflare/workers-types"]
  }
}
```

**JSX**: Hono's JSX (`hono/jsx`) を使用。ただし現状はHTMLテンプレートリテラルが多用されており、JSXはほとんど使われていない。

---

## 5. ビルド設定（vite.config.ts）

```typescript
import { defineConfig } from 'vite'
import pages from '@hono/vite-cloudflare-pages'

export default defineConfig({
  plugins: [pages()],
  build: {
    outDir: 'dist'
  }
})
```

**出力**: `dist/_worker.js` (356.85 kB、43モジュール) + 静的アセット

---

## 6. コードメトリクス

| ファイル | 行数 | 役割 | 複雑度 |
|---|---|---|---|
| `src/routes/pages.ts` | 5,106 | SSRページ生成 | 🔴 高（単一ファイルが大きすぎる） |
| `src/routes/api.ts` | 2,544 | JSON API | 🟡 中 |
| `src/index.tsx` | 389 | エントリ・デモデータ | 🟢 低 |
| `src/auth.ts` | 435 | 認証 | 🟢 低（明確に分離されている） |
| `public/static/new-order.js` | 1,102 | 発注フォームUI | 🟡 中 |
| `public/static/products-page.js` | 690 | 商品マスタUI | 🟢 低 |
| `src/xlsxHelper.ts` | 〜300 | Excel生成 | 🟡 中 |

---

## 7. 未使用・削除推奨ファイル

| ファイル | 理由 |
|---|---|
| `src/routes/api.ts.bak` | api.tsのバックアップ。開発中に残存。削除推奨 |
| `migrations/0004_supplier_rules.sql.bak` | バックアップ。削除推奨 |
