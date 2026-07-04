# ARCHITECTURE.md — システム構成図

> **最終更新**: 2026-06-25

---

## 1. システム全体構成図

```mermaid
graph TB
    subgraph Client["クライアント層"]
        Browser["🌐 ブラウザ\nBootstrap 5 / Vanilla JS\nFont Awesome 6"]
        MailClient["📧 メールクライアント\n(Gmail等)\nmailto:リンク経由"]
    end

    subgraph Cloudflare["☁️ Cloudflare Edge Network"]
        subgraph Pages["Cloudflare Pages"]
            StaticAssets["📦 静的ファイル\npublic/static/\n- new-order.js\n- products-page.js\n- style.css"]
        end
        
        subgraph Workers["Cloudflare Workers (_worker.js)"]
            HonoApp["🔥 Hono App\nsrc/index.tsx\n\n- 認証ミドルウェア\n- ルーティング\n- Cron Handler"]
            
            subgraph Routes["ルーティング"]
                PageRoutes["📄 Page Routes\nsrc/routes/pages.ts\n17エンドポイント\nSSR HTML生成"]
                APIRoutes["⚡ API Routes\nsrc/routes/api.ts\n52エンドポイント\nJSON返却"]
                AuthModule["🔐 Auth Module\nsrc/auth.ts\nHMAC-SHA256\nCookie発行"]
            end
            
            XlsxHelper["📊 xlsxHelper.ts\nExcel出力\n(外部ライブラリ不使用)"]
            LandingPage["🏠 Landing\nsrc/routes/landing.ts"]
        end
        
        subgraph Storage["Cloudflare Storage"]
            D1["🗄️ D1 Database\ngolfwing-production\nSQLite互換\n11テーブル"]
        end
        
        subgraph Trigger["Cloudflare Triggers"]
            Cron["⏰ Cron Trigger\n毎日 JST 00:00\nデモデータリセット"]
        end
    end

    subgraph External["外部サービス"]
        Wrangler["🛠️ Wrangler CLI\nデプロイ管理"]
        Vite["⚡ Vite + @hono/vite-build\nビルドツール"]
    end

    Browser -->|HTTPS| Pages
    Browser -->|HTTPS| Workers
    MailClient -.->|mailto:リンク| Browser
    HonoApp --> PageRoutes
    HonoApp --> APIRoutes
    HonoApp --> AuthModule
    HonoApp --> LandingPage
    APIRoutes --> XlsxHelper
    PageRoutes --> D1
    APIRoutes --> D1
    AuthModule --> D1
    Cron --> HonoApp
    Wrangler -.->|deploy| Pages
    Vite -.->|build| Workers
```

---

## 2. 認証フロー

```mermaid
sequenceDiagram
    participant B as ブラウザ
    participant W as Workers (Hono)
    participant D as D1 Database

    B->>W: POST /login {username, password}
    W->>D: SELECT users JOIN tenants WHERE username=? AND password=?
    D-->>W: UserRow {tenant_id, is_admin, ...}
    W->>W: createToken("username:tenantId:expires") + HMAC-SHA256署名
    W-->>B: 302 /dashboard + Set-Cookie: gw_session=token; HttpOnly; SameSite=Strict

    Note over B,W: 以降のリクエスト

    B->>W: GET /dashboard + Cookie: gw_session=token
    W->>W: verifyToken() → parseCookie → HMAC検証
    W->>D: SELECT users WHERE username=? AND tenant_id=?
    D-->>W: SessionUser {username, tenantId, displayName, isDemo, isAdmin}
    W->>W: c.set('sessionUser', user)
    W-->>B: 200 HTML

    Note over B,W: デモログイン

    B->>W: GET /demo-login
    W->>W: createToken("demo:0:expires")
    W-->>B: 302 /dashboard + Set-Cookie (tenant_id=0)
    Note over W,D: デモ用はDB照会不要（tenant_id=0で直接復元）
```

---

## 3. データ処理フロー（発注作成）

```mermaid
sequenceDiagram
    participant JS as new-order.js<br/>(Browser)
    participant API as /api (Workers)
    participant D1 as D1 Database

    JS->>API: GET /api/products-for-order?q=フジクラ
    API->>D1: SELECT products WHERE name LIKE AND tenant_id=?
    D1-->>API: products[]
    API-->>JS: JSON

    JS->>API: GET /api/products/:id/suppliers
    API->>D1: SELECT product_suppliers + suppliers WHERE product_id=? AND tenant_id=?
    D1-->>API: suppliers[] (with rate)
    alt フォールバック
        API->>D1: SELECT supplier_rules WHERE item_category=? AND manufacturer=?
        D1-->>API: rule (仕入先・掛け率)
    end
    API-->>JS: JSON {suppliers: [{id, name, rate, notes}]}

    JS->>JS: unit_price = list_price × rate で自動計算

    JS->>API: POST /api/orders {items[], customer_name, ...}
    API->>D1: INSERT purchase_orders + purchase_order_items
    D1-->>API: {orderId, batchCode}
    API->>API: buildEmailBody() メール文面生成
    API-->>JS: {ok: true, orderId, batchCode, emailSubject, emailBody}
    JS->>JS: location.href = /mail-batch/:batchCode
```

---

## 4. マルチテナント分離

```mermaid
graph TD
    subgraph "データ分離（tenant_id）"
        T0["tenant_id = 0\n📦 デモテナント\n毎日自動リセット\n書き込み禁止"]
        T1["tenant_id = 1\n🏌️ ゴルフウィング\n本番データ\n全機能利用可"]
        TN["tenant_id = N\n🏪 将来の販売先\n（未実装）"]
    end
    
    subgraph "テーブル（全てtenant_id持ち）"
        Suppliers["suppliers"]
        Products["products"]
        Orders["purchase_orders"]
        Receipts["receipts"]
        Rules["supplier_rules"]
    end
    
    T0 -.->|READ ONLY| Suppliers
    T1 --> Suppliers
    T1 --> Products
    T1 --> Orders
    T1 --> Receipts
    T1 --> Rules
    
    Note["⚠️ users, tenants テーブルは\ntenant_id分離なし（共有）"]
```

---

## 5. ビルド・デプロイパイプライン

```mermaid
flowchart LR
    subgraph Dev["開発環境（Sandbox）"]
        Src["src/\nTypeScript"]
        PubSrc["public/\nStatic Assets"]
    end
    
    subgraph Build["ビルド (Vite + @hono/vite-build)"]
        ViteBuild["npm run build\nvite build"]
        Dist["dist/\n- _worker.js (356KB)\n- static/\n- _routes.json"]
    end
    
    subgraph Deploy["デプロイ"]
        WranglerDeploy["wrangler pages deploy dist\n--project-name golfwing-order"]
        CFPages["Cloudflare Pages\ngolfwing-order.pages.dev"]
    end
    
    subgraph Migrate["DB マイグレーション"]
        WranglerD1["wrangler d1 migrations apply\ngolfwing-production"]
        D1Remote["D1 Database\n(本番)"]
    end
    
    Src --> ViteBuild
    PubSrc --> ViteBuild
    ViteBuild --> Dist
    Dist --> WranglerDeploy
    WranglerDeploy --> CFPages
    WranglerD1 --> D1Remote
```

---

## 6. 環境変数（Cloudflare Secrets）

| 変数名 | 用途 | 必須 |
|---|---|---|
| `AUTH_SECRET` | HMAC署名の秘密鍵 | ✅ 必須（未設定時はデフォルト値を使用、本番では必須） |
| `APP_NAME` | システム表示名 | 任意 |
| `APP_SENDER_NAME` | メール差出人名 | 任意 |
| `APP_SENDER_SHOP` | ショップ名（メール署名） | 任意 |
| `APP_SENDER_ADDR` | 住所（メール署名） | 任意 |
| `APP_SENDER_TEL` | 電話番号（メール署名） | 任意 |
| `APP_SENDER_MAIL` | 差出人メールアドレス | 任意 |
| `APP_DEFAULT_CC` | デフォルトCCアドレス | 任意 |
| `DEMO_MODE` | "1"で強制デモモード | 任意 |
| `AUTH_USERNAME` | 後方互換ユーザー名 | 非推奨 |
| `AUTH_PASSWORD` | 後方互換パスワード | 非推奨 |

---

## 7. 外部依存関係

| サービス | 用途 | 現状 |
|---|---|---|
| Cloudflare Workers | エッジランタイム | ✅ 利用中 |
| Cloudflare D1 | データベース | ✅ 利用中 |
| Cloudflare Pages | ホスティング | ✅ 利用中 |
| Cloudflare Cron Triggers | デモデータリセット | ✅ 利用中 |
| Bootstrap 5 CDN | UIフレームワーク | ✅ 利用中 |
| Font Awesome 6 CDN | アイコン | ✅ 利用中 |
| SendGrid / Resend | メール送信 | ❌ 未統合（現在はmailto:） |
| Slack API | 通知 | ❌ 未統合 |
