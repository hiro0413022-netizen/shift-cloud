# API.md — APIエンドポイント詳細

> **最終更新**: 2026-06-25  
> **ベースURL**: `https://golfwing-order.pages.dev/api`  
> **認証**: Cookie `gw_session` (HMAC-SHA256署名トークン)  
> **デモモード**: GETリクエストのみ許可、それ以外は403を返す

---

## 1. エンドポイント一覧

| # | メソッド | パス | 機能 | 認証 | デモ |
|---|---|---|---|---|---|
| 1 | GET | `/api/dashboard` | ダッシュボードデータ | ✅ | ✅読取 |
| 2 | GET | `/api/products` | 商品一覧 | ✅ | ✅読取 |
| 3 | GET | `/api/suppliers` | 仕入先一覧 | ✅ | ✅読取 |
| 4 | GET | `/api/rules` | 判定ルール一覧 | ✅ | ✅読取 |
| 5 | GET | `/api/orders` | 発注一覧 | ✅ | ✅読取 |
| 6 | GET | `/api/orders/:id` | 発注詳細 | ✅ | ✅読取 |
| 7 | POST | `/api/orders` | 発注作成 | ✅ | ❌ |
| 8 | POST | `/api/orders/:id/mark-ordered` | 発注済みマーク | ✅ | ❌ |
| 9 | POST | `/api/orders/:id/regenerate-mail` | メール文再生成 | ✅ | ❌ |
| 10 | POST | `/api/orders/:id/items` | 発注明細追加 | ✅ | ❌ |
| 11 | PUT | `/api/items/:poi_id` | 発注明細更新 | ✅ | ❌ |
| 12 | DELETE | `/api/items/:poi_id` | 発注明細削除 | ✅ | ❌ |
| 13 | GET | `/api/pool` | プール一覧 | ✅ | ✅読取 |
| 14 | GET | `/api/pool/items/:order_id` | プール明細 | ✅ | ✅読取 |
| 15 | POST | `/api/pool/execute` | プール一括実行 | ✅ | ❌ |
| 16 | DELETE | `/api/pool/:order_id` | プールから削除 | ✅ | ❌ |
| 17 | GET | `/api/mail-batch/:batch_code` | メールバッチデータ | ✅ | ✅読取 |
| 18 | GET | `/api/receipts` | 入荷一覧 | ✅ | ✅読取 |
| 19 | POST | `/api/receipts` | 入荷登録 | ✅ | ❌ |
| 20 | PUT | `/api/receipts/:id` | 入荷更新 | ✅ | ❌ |
| 21 | POST | `/api/receipts/free` | フリー入荷登録 | ✅ | ❌ |
| 22 | GET | `/api/backorders` | 残注一覧 | ✅ | ✅読取 |
| 23 | GET | `/api/products-for-order` | 発注用商品検索 | ✅ | ✅読取 |
| 24 | GET | `/api/receipts/download` | 入荷明細Excel出力 | ✅ | ✅読取 |
| 25 | POST | `/api/suppliers` | 仕入先作成 | ✅ | ❌ |
| 26 | PUT | `/api/suppliers/:id` | 仕入先更新 | ✅ | ❌ |
| 27 | DELETE | `/api/suppliers/:id` | 仕入先削除 | ✅ | ❌ |
| 28 | GET | `/api/product-suppliers/:product_id` | 商品の仕入先一覧 | ✅ | ✅読取 |
| 29 | POST | `/api/product-suppliers` | 商品仕入先登録 | ✅ | ❌ |
| 30 | PUT | `/api/product-suppliers/:id` | 商品仕入先更新 | ✅ | ❌ |
| 31 | DELETE | `/api/product-suppliers/:id` | 商品仕入先削除 | ✅ | ❌ |
| 32 | GET | `/api/products/:id/suppliers` | 商品の発注用仕入先 | ✅ | ✅読取 |
| 33 | POST | `/api/products` | 商品作成 | ✅ | ❌ |
| 34 | GET | `/api/products/:id` | 商品詳細 | ✅ | ✅読取 |
| 35 | PUT | `/api/products/:id` | 商品更新 | ✅ | ❌ |
| 36 | DELETE | `/api/products/:id` | 商品削除 | ✅ | ❌ |
| 37 | POST | `/api/products/bulk-update` | 商品一括更新 | ✅ | ❌ |
| 38 | POST | `/api/products/bulk-import` | 商品一括インポート | ✅ | ❌ |
| 39 | POST | `/api/rules` | ルール作成 | ✅ | ❌ |
| 40 | PUT | `/api/rules/:id` | ルール更新 | ✅ | ❌ |
| 41 | DELETE | `/api/rules/:id` | ルール削除 | ✅ | ❌ |
| 42 | POST | `/api/orders/:id/copy` | 発注コピー | ✅ | ❌ |
| 43 | PUT | `/api/orders/:id/header` | 発注ヘッダー更新 | ✅ | ❌ |
| 44 | POST | `/api/orders/:id/status` | 発注ステータス変更 | ✅ | ❌ |
| 45 | DELETE | `/api/orders/:id` | 発注削除 | ✅ | ❌ |
| 46 | GET | `/api/dashboard/pending-inspection` | 検品待ち一覧 | ✅ | ✅読取 |
| 47 | PATCH | `/api/orders/:id/items/:poi_id/inspect` | 明細検品済みマーク | ✅ | ❌ |
| 48 | GET | `/api/backup/all` | 全データバックアップ | ✅管理者 | ❌ |
| 49 | GET | `/api/backup/csv/:table` | テーブルCSVエクスポート | ✅管理者 | ❌ |
| 50 | POST | `/api/backup/restore/all` | 全データリストア | ✅管理者 | ❌ |
| 51 | POST | `/api/backup/restore/csv` | CSVリストア | ✅管理者 | ❌ |
| 52 | GET | `/api/demo-reset` | デモデータリセット | ✅secretパラメータ | — |

---

## 2. 主要エンドポイント詳細

### POST `/api/orders` — 発注作成

**Request Body (JSON)**:
```json
{
  "items": [
    {
      "item_category": "シャフト",
      "manufacturer": "フジクラ",
      "product_name": "VENTUS TR Blue 5S",
      "spec": "5S",
      "club_type": "DR",
      "quantity": 1,
      "list_price": 58000,
      "rate": 0.45,
      "unit_price": 26100,
      "amount": 26100,
      "customer_name": "田中 一郎 様",
      "product_id": 42
    }
  ],
  "supplier_id": 7,
  "order_date": "2026-06-25",
  "ordered_by": "スタッフA",
  "customer_name": "田中 一郎 様",
  "usage_type": "取替",
  "order_note": "",
  "save_as_draft": false
}
```

**Response (200)**:
```json
{
  "ok": true,
  "orderId": 123,
  "batchCode": "WK-202606251234",
  "emailSubject": "発注依頼 [WK-202606251234]",
  "emailBody": "ワークスシャフト株式会社\n小森 健太 様\n..."
}
```

---

### POST `/api/orders/:id/status` — ステータス変更

**Request Body (JSON)**:
```json
{ "status": "ordered" }
```

**Response (200)**:
```json
{
  "ok": true,
  "next_mail_batch": "WK-202606251235",
  "next_order_id": 124
}
```

> `next_mail_batch` / `next_order_id`: 同一顧客の次の未発注（draft_created）発注がある場合に返される。フロントエンドは確認ダイアログを表示して自動遷移する。

---

### GET `/api/products/:id/suppliers` — 商品の発注用仕入先一覧

**Response (200)**:
```json
{
  "suppliers": [
    {
      "id": 7,
      "name": "ワークスシャフト株式会社",
      "rate": 0.45,
      "is_default": 1,
      "notes": "通常ルート",
      "contact_name": "小森 健太",
      "honorific": "様",
      "email": "order@works.co.jp"
    }
  ],
  "source": "product_suppliers"
}
```

> `source`: `"product_suppliers"` (直接登録) / `"default_supplier"` (products.default_supplier_id) / `"supplier_rules"` (ルール判定) / `"none"` (不明)

---

### GET `/api/mail-batch/:batch_code` — メールバッチデータ

**Response (200)**:
```json
{
  "orders": [
    {
      "id": 123,
      "order_no": "WK-202606251234-001",
      "customer_name": "田中 一郎 様",
      "email_subject": "発注依頼 [WK-202606251234]",
      "email_body": "...",
      "supplier_email": "order@works.co.jp",
      "supplier_cc_emails": "cc@works.co.jp,manager@works.co.jp",
      "supplier_name": "ワークスシャフト株式会社",
      "items": [...]
    }
  ],
  "batchTotal": 26100,
  "freeShippingThreshold": 25000
}
```

---

### GET `/api/receipts/download` — Excel出力

**Query Parameters**:
- `receipt_id`: 入荷ID (複数指定可: `?receipt_id=1&receipt_id=2`)
- `order_id`: 発注ID (複数指定可)

**Response**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
（バイナリ .xlsx ファイル）

---

### POST `/api/backup/restore/all` — 全データリストア（管理者専用）

**Request Body (JSON)**:
```json
{
  "suppliers": [...],
  "products": [...],
  "supplier_rules": [...],
  "purchase_orders": [...],
  "purchase_order_items": [...],
  "receipts": [...],
  "receipt_items": [...]
}
```

**⚠️ 注意**: 既存データを全件削除してから投入する。本番環境での実行は慎重に。

---

## 3. OpenAPI 3.0 スキーマ（主要エンドポイント）

```yaml
openapi: "3.0.3"
info:
  title: GolfWing Order Management API
  version: "1.13"
  description: ゴルフウィング 発注管理システム API

servers:
  - url: https://golfwing-order.pages.dev/api
    description: Production

components:
  securitySchemes:
    cookieAuth:
      type: apiKey
      in: cookie
      name: gw_session
  
  schemas:
    Order:
      type: object
      properties:
        id: { type: integer }
        batch_code: { type: string, example: "WK-202606251234" }
        order_no: { type: string, example: "WK-202606251234-001" }
        order_date: { type: string, format: date }
        ordered_by: { type: string }
        supplier_id: { type: integer }
        customer_name: { type: string }
        status:
          type: string
          enum: [draft, draft_created, pool, ordered, partial, completed, cancelled]
        email_subject: { type: string }
        email_body: { type: string }
        tenant_id: { type: integer }
    
    OrderItem:
      type: object
      properties:
        id: { type: integer }
        purchase_order_id: { type: integer }
        product_id: { type: integer, nullable: true }
        item_category: { type: string }
        manufacturer: { type: string }
        product_name: { type: string }
        spec: { type: string }
        club_type: { type: string }
        quantity: { type: integer }
        list_price: { type: number }
        rate: { type: number, minimum: 0, maximum: 1 }
        unit_price: { type: number }
        amount: { type: number }
        customer_name: { type: string }
    
    Supplier:
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
        contact_name: { type: string }
        honorific: { type: string }
        order_method: { type: string, enum: [メール, LINE, FAX, その他] }
        email: { type: string, format: email }
        cc_emails: { type: string, description: "カンマ区切りCCアドレス" }
        free_shipping_threshold: { type: integer, nullable: true }
        is_active: { type: integer, enum: [0, 1] }
        tenant_id: { type: integer }
    
    Product:
      type: object
      properties:
        id: { type: integer }
        item_category: { type: string }
        manufacturer: { type: string }
        name: { type: string }
        spec: { type: string }
        club_type: { type: string }
        list_price: { type: number }
        default_rate: { type: number }
        default_supplier_id: { type: integer, nullable: true }
        unit: { type: string }
        is_active: { type: integer, enum: [0, 1] }
        tenant_id: { type: integer }
    
    Error:
      type: object
      properties:
        error: { type: string }
        demo: { type: boolean }

security:
  - cookieAuth: []

paths:
  /orders:
    get:
      summary: 発注一覧取得
      parameters:
        - name: status
          in: query
          schema: { type: string }
        - name: supplier_id
          in: query
          schema: { type: integer }
      responses:
        '200':
          description: 発注一覧
          content:
            application/json:
              schema:
                type: object
                properties:
                  orders:
                    type: array
                    items: { $ref: '#/components/schemas/Order' }
        '401': { description: 未認証 }
    
    post:
      summary: 発注作成
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [items, supplier_id, order_date]
              properties:
                items:
                  type: array
                  items: { $ref: '#/components/schemas/OrderItem' }
                supplier_id: { type: integer }
                order_date: { type: string, format: date }
                ordered_by: { type: string }
                customer_name: { type: string }
                save_as_draft: { type: boolean }
      responses:
        '200':
          description: 発注作成成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
                  orderId: { type: integer }
                  batchCode: { type: string }
                  emailSubject: { type: string }
                  emailBody: { type: string }
        '403':
          description: デモモードでの書き込み拒否
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
  
  /orders/{id}/status:
    post:
      summary: 発注ステータス変更
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [status]
              properties:
                status:
                  type: string
                  enum: [ordered, completed, cancelled, partial]
      responses:
        '200':
          description: ステータス変更成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
                  next_mail_batch: { type: string, nullable: true }
                  next_order_id: { type: integer, nullable: true }
  
  /products/{id}/suppliers:
    get:
      summary: 商品の発注用仕入先一覧（掛け率付き）
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: 仕入先候補一覧
          content:
            application/json:
              schema:
                type: object
                properties:
                  suppliers:
                    type: array
                    items:
                      type: object
                      properties:
                        id: { type: integer }
                        name: { type: string }
                        rate: { type: number }
                        is_default: { type: integer }
                        notes: { type: string }
                  source:
                    type: string
                    enum: [product_suppliers, default_supplier, supplier_rules, none]
  
  /receipts/download:
    get:
      summary: 入荷明細Excel出力
      parameters:
        - name: receipt_id
          in: query
          schema: { type: integer }
          description: "複数指定可"
        - name: order_id
          in: query
          schema: { type: integer }
          description: "複数指定可"
      responses:
        '200':
          description: Excelファイル
          content:
            application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
              schema:
                type: string
                format: binary
```

---

## 4. エラーレスポンス

| HTTP Status | 状況 | レスポンス |
|---|---|---|
| 302 | 未認証アクセス（ページ） | `/login?next=PATH` にリダイレクト |
| 400 | バリデーションエラー | `{"error": "メッセージ"}` |
| 401 | 未認証（API） | `{"error": "Unauthorized"}` |
| 403 | デモモード書き込み禁止 | `{"error": "デモモードでは...", "demo": true}` |
| 404 | リソース不存在 | `{"error": "Not found"}` |
| 500 | サーバーエラー | `{"error": "エラーメッセージ"}` |

---

## 5. 認証フロー

全APIは `gw_session` Cookie による認証が必要（`/api/demo-reset` を除く）。

```
Cookie形式: gw_session=username:tenantId:expires:HMAC署名
TTL: 7日間
HttpOnly: true
SameSite: Strict
```

デモモードでの書き込み（POST/PUT/DELETE/PATCH）は全て403を返す。
