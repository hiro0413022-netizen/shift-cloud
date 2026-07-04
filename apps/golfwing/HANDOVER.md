# GolfOrder 発注管理システム — Cowork引き継ぎサマリー

## プロジェクト概要

ゴルフショップ向けの発注管理WebアプリケーションをHono + Cloudflare Pages/D1で構築。

- **本番URL**: https://golfwing-order.pages.dev（または最新デプロイURL）
- **最新デプロイ**: https://daaeba78.golfwing-order.pages.dev
- **Cloudflareプロジェクト名**: `golfwing`
- **D1データベース名**: `golfwing-production`（ID: `eb6484c8-67de-48c0-83ee-b250d95f89ef`）
- **Gitコミット**: `2849f87`
- **バックアップ**: https://www.genspark.ai/api/files/s/GukSymaw

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フレームワーク | Hono (Cloudflare Workers) |
| フロントエンド | Bootstrap 5 + Tailwind (CDN) + 素のJS |
| DB | Cloudflare D1 (SQLite) |
| 認証 | Cookie + JWT (`AUTH_SECRET` 環境変数) |
| デプロイ | Cloudflare Pages (`wrangler pages deploy`) |

---

## 認証情報

| 種類 | ユーザー名 | パスワード |
|---|---|---|
| 管理者 | `golfwing` | `tkgw100f` |
| デモ | `/demo-login` でアクセス（読み取り専用） |

---

## ファイル構成

```
/home/user/webapp/
├── src/
│   ├── index.tsx          # エントリーポイント・/demo-login・/ルート・デモデータ
│   ├── auth.ts            # ログイン認証・Cookie発行（全リダイレクト先: /dashboard）
│   └── routes/
│       ├── pages.ts       # 全ページルート（4850行超）★主要編集対象
│       ├── api.ts         # REST APIルート
│       └── landing.ts     # ランディングページ
├── public/static/
│   ├── new-order.js       # 発注作成画面JS（商品選択・仕入先切り替え）
│   ├── products-page.js   # 商品マスタページJS（複数仕入先管理モーダル）
│   └── style.css
├── migrations/
│   ├── 0001〜0011         # 既存マイグレーション
│   ├── 0012_supplier_cc_emails.sql   # suppliers.cc_emails追加
│   └── 0013_product_suppliers.sql   # product_suppliersテーブル追加
└── wrangler.jsonc         # name:golfwing, D1: golfwing-production
```

---

## DBスキーマ（主要テーブル）

```sql
suppliers           -- 仕入先（email, cc_emails ← 今回追加）
products            -- 商品マスタ（default_supplier_id, default_rate）
product_suppliers   -- 商品×仕入先の多対多（rate, is_default, notes）← 今回追加
supplier_rules      -- 品目/メーカーから仕入先を自動判定するルール
purchase_orders     -- 発注ヘッダー（status, customer_name, batch_code, tenant_id）
purchase_order_items-- 発注明細（product_name, quantity, rate, unit_price）
receipts            -- 入荷ヘッダー
receipt_items       -- 入荷明細
users               -- ユーザー（tenant_id で分離）
```

### purchase_orders.status の遷移

```
draft → draft_created → ordered → partial → completed
                    ↘ pool（プール発注）
                    ↘ cancelled
```

---

## セッション管理

```typescript
// SessionUser型
type SessionUser = {
  username: string
  tenantId: number
  displayName: string
  isDemo: boolean
  isAdmin: boolean
}

// DEMO_TENANT_ID = 0（読み取り専用、毎日自動リセット）
// /demo-login → /dashboard へリダイレクト
// / ルートはgetCurrentUser()で認証チェック → ログイン済みなら/dashboardへ
```

---

## 今セッションで実装した機能

### ⑤ メール文スペース→+修正（完了）
`URLSearchParams.toString()` → `encodeURIComponent()` に変更  
対象: `pages.ts` のmail-batch・発注詳細・regen-mailの3箇所

### ② CCアドレス帳（完了）
- `suppliers.cc_emails` カラム追加（migration 0012）
- 仕入先マスタモーダルにCC入力欄追加
- メールバッチ・発注詳細画面に**CC候補ボタン**（クリックでCC欄にON/OFFトグル）
- 仕入先に設定したCCが初期値として自動セット

### ③ 同一顧客の発注メール連続処理（完了）
`/api/orders/:id/status` のレスポンスに `next_mail_batch` / `next_order_id` を追加  
→「発注済み」にした後、同一顧客名の別仕入先発注があれば確認ダイアログ → 自動遷移

### ④ Enterキー誤送信防止（完了）
`new-order.js` に `keydown` イベント追加  
textarea/button/select以外でEnter押下 → 確認ダイアログ表示

### ① 商品の複数仕入先対応（完了）
- `product_suppliers` テーブル追加（migration 0013）
- API: `GET/POST/PUT/DELETE /product-suppliers`、`GET /products/:id/suppliers`
- 商品マスタページ: 各行に「仕入先」ボタン → 複数仕入先管理モーダル
- 発注作成画面: 商品選択後に複数仕入先がある場合セレクト表示 → 仕入先切り替えで掛け率・単価自動再計算

---

## 重要な実装パターン

### 仕入先CCの取得（pages.ts）
```typescript
// mail-batch画面
const supplierCcEmails = group.supplierCcEmails  // suppliers.cc_emails
const initialCC = supplierCcEmails || BATCH_DEFAULT_CC  // 仕入先優先

// CC候補ボタン（複数アドレスをカンマ区切りで登録可能）
const ccUniq = [...new Set([APP_DEFAULT_CC, ...supplierCcEmails.split(',')])]
```

### 複数仕入先セレクト（new-order.js）
```javascript
// 商品選択後に呼び出し
fetch('/api/products/' + p.id + '/suppliers')
  .then(suppliers => {
    if (suppliers.length > 1) {
      // セレクトを行内に追加、選択変更で掛け率・単価を再計算
    }
  })
```

### 同一顧客連続処理（api.ts）
```typescript
// /api/orders/:id/status (status='ordered'の場合)
const next = await db.prepare(`
  SELECT id, batch_code FROM purchase_orders
  WHERE customer_name=? AND status='draft_created' AND id!=? AND tenant_id=?
  LIMIT 1
`).bind(customer_name, id, tenantId).first()

return c.json({ ok: true, next_mail_batch: next?.batch_code, next_order_id: next?.id })
```

---

## 環境変数（Cloudflare Secrets）

| 変数名 | 内容 |
|---|---|
| `AUTH_SECRET` | JWT署名キー |
| `APP_NAME` | アプリ名表示 |
| `APP_DEFAULT_CC` | デフォルトCC（仕入先CC設定がない場合のフォールバック） |
| `APP_SENDER_NAME` | メール署名: 送信者名 |
| `APP_SENDER_SHOP` | メール署名: 店舗名 |
| `APP_SENDER_TEL` | メール署名: 電話番号 |
| `APP_SENDER_MAIL` | メール署名: メールアドレス |
| `APP_SENDER_ADDR` | メール署名: 住所 |

---

## ビルド・デプロイ手順

```bash
# ビルド
cd /home/user/webapp && npm run build

# ローカルDBマイグレーション
npx wrangler d1 migrations apply golfwing-production --local

# 本番DBマイグレーション
npx wrangler d1 migrations apply golfwing-production --remote

# デプロイ
npx wrangler pages deploy dist --project-name golfwing
```

---

## 既知の課題・今後の改善候補

1. **product_suppliersのデフォルト設定**: PUTでsupplier_id=0の場合はis_defaultのみ更新する暫定実装あり → 編集UIを充実させる場合は改善推奨
2. **発注詳細画面の仕入先変更**: 既存発注の仕入先は変更不可（edit画面で対応可能）
3. **デモデータのproduct_suppliers**: デモテナント(tenant_id=0)のリセット時に `product_suppliers` のリセットは未実装（`index.tsx` の `resetDemoData()` に追加が必要な場合）
4. **メール本文の自動リフレッシュ**: regen-mailボタン後のmailtoリンクはJS側で更新済みだが、CC候補ボタンの状態は再描画されない（リロードで解消）

---

## バックアップファイル

- **ダウンロードURL**: https://www.genspark.ai/api/files/s/GukSymaw
- **形式**: tar.gz（`/home/user/webapp/` 以下全ファイル + .git）
- **復元方法**: `tar -xzf golfwing_order_backup_2026-06-25.tar.gz -C /`
