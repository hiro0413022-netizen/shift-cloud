# ゴルフウィング 発注管理システム

## プロジェクト概要

- **名称**: ゴルフウィング 発注管理システム
- **目的**: ゴルフショップ向けの仕入れ発注・納品管理Webアプリ
- **技術スタック**: Hono (TypeScript) + Cloudflare Pages + D1 SQLite
- **移植元**: Flask (Python) → Hono (TypeScript/Cloudflare Workers)

## 主な機能

| 機能 | 説明 |
|------|------|
| ダッシュボード | 発注・仕入先・残注件数の一覧表示 |
| 新規発注 | 複数明細を入力し、仕入先判定ルールで自動振り分け・メール下書き生成 |
| 発注一覧 | ステータス・仕入先・キーワードで絞り込み |
| 発注詳細 | 発注明細・入荷状況・メール下書き・納品履歴を一画面で確認 |
| メールバッチ | 発注後に仕入先別メール下書きを一覧表示・コピー機能付き |
| 納品登録 | 発注に対して入荷数量を登録、ステータス自動更新 |
| 残注一覧 | 未入荷・一部入荷の明細を横断的に表示 |
| 納品履歴 | 過去の納品登録を一覧表示 |
| 商品マスタ | 商品検索・一覧表示 |
| 仕入先マスタ | 登録仕入先の一覧表示 |
| 判定ルール | 品目・メーカー・種類による仕入先自動判定ルールの確認 |

## URL構成

### ページ
| パス | 説明 |
|------|------|
| `/` | ダッシュボード |
| `/orders/new` | 新規発注フォーム |
| `/orders` | 発注一覧（?status=&supplier=&q= でフィルタ） |
| `/orders/:id` | 発注詳細 |
| `/mail-batch/:batch_code` | メール下書き一覧 |
| `/receipts` | 納品履歴 |
| `/receipts/new/:order_id` | 納品登録フォーム |
| `/backorders` | 残注一覧 |
| `/products` | 商品マスタ（?q= で検索） |
| `/suppliers` | 仕入先マスタ |
| `/rules` | 仕入先判定ルール |

### API
| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/dashboard` | ダッシュボード集計データ |
| GET | `/api/orders` | 発注一覧 |
| POST | `/api/orders` | 新規発注作成 |
| GET | `/api/orders/:id` | 発注詳細 |
| POST | `/api/orders/:id/mark-ordered` | 発注済みステータス更新 |
| GET | `/api/mail-batch/:batch_code` | メールバッチ取得 |
| GET | `/api/receipts` | 納品履歴 |
| POST | `/api/receipts` | 納品登録 |
| GET | `/api/backorders` | 残注一覧 |
| GET | `/api/products` | 商品マスタ |
| GET | `/api/products-for-order` | 発注用商品候補 |
| GET | `/api/suppliers` | 仕入先マスタ |
| GET | `/api/rules` | 判定ルール |

## データモデル

```
suppliers          仕入先マスタ
supplier_rules     仕入先判定ルール（品目・メーカー・種類→仕入先の自動判定）
products           商品マスタ
purchase_orders    発注ヘッダ（1バッチ＝複数発注が生成される）
purchase_order_items  発注明細
receipts           納品ヘッダ
receipt_items      納品明細
```

## 仕入先判定ロジック

1. 商品マスタに`default_supplier_id`が設定されている場合 → 優先使用
2. なければ `supplier_rules` を品目・メーカー・種類で照合（優先度順）
3. 合致するルールがない場合 → エラー（発注不可）

## 発注ステータス遷移

```
draft_created → ordered → partial → completed
                        ↘ cancelled
```

## ローカル開発

```bash
# 依存パッケージインストール（初回のみ）
npm install

# DBセットアップ（初回のみ）
npm run db:migrate:local
npm run db:seed

# ビルド
npm run build

# 起動（PM2）
pm2 start ecosystem.config.cjs

# または直接起動
npm run dev:sandbox

# DB確認
npx wrangler d1 execute golfwing-production --local --command="SELECT * FROM suppliers"
```

## デプロイ（Cloudflare Pages）

```bash
# Cloudflare認証後
npx wrangler d1 create golfwing-production
# → database_id を wrangler.jsonc に設定

npx wrangler d1 migrations apply golfwing-production
npm run deploy
```

## プロジェクト構成

```
webapp/
├── src/
│   ├── index.tsx          # エントリポイント（Honoアプリ）
│   └── routes/
│       ├── api.ts         # REST API実装
│       └── pages.ts       # HTMLページ実装
├── public/static/
│   └── style.css          # カスタムCSS
├── migrations/
│   └── 0001_initial_schema.sql
├── seed.sql               # サンプルデータ
├── wrangler.jsonc         # Cloudflare設定
├── ecosystem.config.cjs   # PM2設定
└── package.json
```

## 更新履歴

- **2026-05-08**: Flask (Python) から Hono (TypeScript/Cloudflare Pages) へ移植完了
