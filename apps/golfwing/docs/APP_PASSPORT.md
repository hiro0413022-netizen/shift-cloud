# APP_PASSPORT.md — アプリ識別情報

> このドキュメントはアプリケーションのすべての識別情報・メタデータを1箇所にまとめたものです。  
> 新しいAI・開発者が最初に参照すべきリファレンスカードです。  
> 最終更新: 2025-06-25

---

## アイデンティティ

| 項目 | 値 |
|------|-----|
| **アプリ名** | GolfWing 仕入発注管理システム |
| **コードネーム** | `golfwing` / `golfwing-order` |
| **バージョン** | 1.0.0-production |
| **ステータス** | ✅ 本番稼働中 |
| **言語** | TypeScript / JavaScript |
| **作成日** | 2025年（推定） |
| **最終更新** | 2025-06-25 |

---

## オーナーシップ

| 項目 | 値 |
|------|-----|
| **業種** | ゴルフ用品販売 |
| **利用企業** | ゴルフウィング（tenant_id=1） |
| **担当部門** | 購買部門 |
| **主な利用者** | 購買担当者・管理者 |
| **デモ環境** | デモユーザー（tenant_id=0）/ 毎日リセット |

---

## リポジトリ

| 項目 | 値 |
|------|-----|
| **ローカルパス** | `/home/user/webapp` |
| **Gitブランチ** | `main`（本番デプロイ用） |
| **最終コミット** | `1ffc629` "docs: Cowork引き継ぎサマリー(HANDOVER.md)追加" |
| **コミット数** | 〜20コミット（推定） |
| **自動バックアップ** | Genspark AI Drive（毎セッション終了時） |

---

## デプロイメント

| 項目 | 値 |
|------|-----|
| **プラットフォーム** | Cloudflare Pages |
| **プロジェクト名** | `golfwing` |
| **本番URL** | `https://golfwing.pages.dev` |
| **ランタイム** | Cloudflare Workers（エッジランタイム） |
| **ビルド成果物** | `dist/_worker.js` (356.85 kB) |
| **ビルドツール** | Vite 6.3.5 + @hono/vite-build |
| **モジュール数** | 43モジュール |
| **デプロイコマンド** | `npm run build && wrangler pages deploy dist` |

---

## データベース

| 項目 | 値 |
|------|-----|
| **DBサービス** | Cloudflare D1（SQLite互換） |
| **DB名** | `golfwing-production` |
| **Database ID** | `eb6484c8-67de-48c0-83ee-b250d95f89ef` |
| **バインディング名** | `DB` |
| **テーブル数** | 11テーブル |
| **インデックス数** | 25インデックス |
| **マイグレーション数** | 13ファイル（0001〜0013） |
| **最終マイグレーション** | `0013_product_suppliers.sql`（複数仕入先対応） |

### テーブル一覧
```
users             — 認証・ユーザー管理（tenant_id分離）
suppliers         — 仕入先マスタ
customers         — 顧客（発注先）マスタ
products          — 商品マスタ
product_suppliers — 商品×仕入先（多対多、Migration 0013）
supplier_rules    — 仕入先自動選定ルール
purchase_orders   — 発注ヘッダー
purchase_order_items — 発注明細
receiving_records — 入荷記録ヘッダー
receiving_items   — 入荷記録明細
system_settings   — テナント設定
```

---

## フレームワーク・ライブラリ

### バックエンド（Cloudflare Workers）
| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| `hono` | ^4.12.12 | Webフレームワーク（コア） |
| `@cloudflare/workers-types` | latest | Cloudflare Workers型定義 |
| `wrangler` | ^4.4.0 | Cloudflare CLI・ビルド |
| `vite` | ^6.3.5 | ビルドツール |
| `@hono/vite-build` | latest | Vite用Honoビルドプラグイン |

### フロントエンド（CDN読み込み）
| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| Bootstrap | 5.x | UIフレームワーク |
| Font Awesome | 6.x | アイコン |
| （外部ライブラリなし） | — | Excel生成（OOXML手動構築） |

---

## アーキテクチャサマリー

```
┌─────────────────────────────────────────────────────────────┐
│                    ユーザー（ブラウザ）                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│              Cloudflare Edge Network                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Cloudflare Pages / Workers                 │    │
│  │  ┌───────────────────────────────────────────────┐  │    │
│  │  │  Hono App (src/index.tsx)                      │  │    │
│  │  │  ├── 認証MW (src/auth.ts)                     │  │    │
│  │  │  ├── APIルーター (src/routes/api.ts: 52EP)    │  │    │
│  │  │  ├── ページルーター (src/routes/pages.ts: 17P)│  │    │
│  │  │  └── Cronハンドラー (毎日UTC15:00)            │  │    │
│  │  └───────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │         Cloudflare D1 (golfwing-production)          │    │
│  │         SQLite互換 / グローバル分散                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## スコアカード

### セキュリティスコア: 61.5 / 100
（詳細: [SECURITY.md](./SECURITY.md)）

| 項目 | スコア | 主要問題 |
|------|--------|---------|
| SQL Injection | 75 | bulk-importの文字列連結 |
| XSS | 85 | 一部escapeミス |
| CSRF | 30 | 未実装 ❌ |
| 認証 | 70 | パスワード平文保存 ❌ |
| 権限 | 75 | Admin判定がDBなくCookie依存 |
| API | 65 | Rateなし・エラー詳細過多 |
| **Secrets** | **20** | AUTH_SECRETデフォルト値 ❌ |
| Logging | 50 | 構造化ログなし |
| Backup | 40 | 手動バックアップのみ |
| Rate Limit | 0 | 未実装 ❌ |

### 品質スコア: 64.8 / 100
（詳細: [QUALITY.md](./QUALITY.md)）

| 項目 | スコア | 主要問題 |
|------|--------|---------|
| コード品質 | 72 | 型`any`多用・エラーハンドリング不統一 |
| 保守性 | 45 | pages.ts 5,106行の単一ファイル ❌ |
| 可読性 | 70 | 命名は良好・コメントが少ない |
| 拡張性 | 65 | DI未使用・ハードコード多数 |
| パフォーマンス | 75 | Nクエリ問題あり |
| AI可読性 | 78 | ドキュメント整備で改善見込み |
| **テスト** | **0** | テスト皆無 ❌ |
| コメント | 55 | 重要な業務ロジックにコメントなし |
| 命名 | 82 | 全体的に良好 |

---

## 技術的負債サマリー

（詳細: [TECH_DEBT.md](./TECH_DEBT.md)）

| 優先度 | 件数 | 代表的な問題 |
|--------|------|------------|
| 🔴 Critical | 3件 | パスワード平文・AUTH_SECRETデフォルト・SQLiリスク |
| 🟠 High | 4件 | pages.ts分割未・テストなし・CSRF未・suggest-supplier 404 |
| 🟡 Medium | 5件 | N+1クエリ・Rate Limit未・エラーログ未・型anyなど |
| 🟢 Low | 2件 | コメント不足・マジックナンバー |

---

## 環境変数

| 変数名 | 必須 | 説明 | 設定場所 |
|--------|------|------|---------|
| `DB` | ✅ | D1データベースバインディング | wrangler.jsonc |
| `AUTH_SECRET` | ⚠️ 推奨必須 | HMAC署名シークレット（現在デフォルト値あり） | Cloudflare Secret |
| `AUTH_USERNAME` | ✅ | 管理者ユーザー名 | Cloudflare Secret |
| `AUTH_PASSWORD` | ✅ | 管理者パスワード（現在平文） | Cloudflare Secret |
| `APP_NAME` | 推奨 | アプリ表示名 | Cloudflare Secret |
| `APP_SENDER_NAME` | 推奨 | 送信者名（メール用） | Cloudflare Secret |
| `APP_SENDER_SHOP` | 推奨 | 店舗名（メール用） | Cloudflare Secret |
| `APP_SENDER_ADDR` | 推奨 | 住所（メール用） | Cloudflare Secret |
| `APP_SENDER_TEL` | 推奨 | 電話番号（メール用） | Cloudflare Secret |
| `APP_SENDER_MAIL` | 推奨 | 送信元メールアドレス | Cloudflare Secret |
| `APP_DEFAULT_CC` | 任意 | デフォルトCCアドレス | Cloudflare Secret |
| `DEMO_MODE` | 任意 | デモモードフラグ | Cloudflare Secret |

---

## ソースコードメトリクス

| ファイル | 行数 | 役割 |
|---------|------|------|
| `src/routes/pages.ts` | 5,106 | 全17ページSSR（最大の技術的負債） |
| `src/routes/api.ts` | 2,544 | 全52エンドポイント |
| `src/auth.ts` | 435 | 認証・セッション管理 |
| `src/index.tsx` | 389 | エントリーポイント・Cron |
| `src/xlsxHelper.ts` | 〜400 | Excel生成（OOXML手動） |
| `public/static/new-order.js` | 1,102 | 発注フォームJS |
| `public/static/products-page.js` | 690 | 商品マスタJS |
| **合計** | **〜11,000行** | |

---

## 接続システム

| システム | 接続状態 | 接続方法 | 備考 |
|---------|---------|---------|------|
| Cloudflare D1 | ✅ 接続済み | Workers Binding | golfwing-production |
| メールサーバー | ❌ 未接続 | mailto:リンク | 手動送信（改善要） |
| YOZAN Genesis | ❌ 未接続 | — | ROADMAP Phase 2で実装予定 |
| Resend (メール) | ❌ 未接続 | REST API | ROADMAP MP-001で実装予定 |
| Cloudflare Workers AI | ❌ 未接続 | Workers Binding | ROADMAP LP-002で実装予定 |

---

## 画面一覧

| # | 画面名 | URL | 状態 |
|---|--------|-----|------|
| 1 | ログイン | `/login` | ✅ |
| 2 | ダッシュボード | `/` | ✅ |
| 3 | 新規発注 | `/orders/new` | ✅ |
| 4 | 発注一覧 | `/orders` | ✅ |
| 5 | 発注詳細 | `/orders/:id` | ✅ |
| 6 | 発注プレビュー | `/orders/:id/preview` | ✅ |
| 7 | 発注メール | `/orders/:id/mail` | ✅ |
| 8 | 入荷処理 | `/receiving/:orderId` | ✅ |
| 9 | 入荷一覧 | `/receiving` | ✅ |
| 10 | 商品マスタ | `/products` | ✅ |
| 11 | 仕入先マスタ | `/suppliers` | ✅ |
| 12 | 顧客マスタ | `/customers` | ✅ |
| 13 | 在庫一覧 | `/inventory` | ✅ |
| 14 | レポート | `/reports` | ✅ |
| 15 | CSV/Excel出力 | `/reports/export` | ✅ |
| 16 | 管理者設定 | `/admin` | ✅ |
| 17 | ユーザー管理 | `/admin/users` | ✅ |

---

## Cronジョブ

| スケジュール | 処理 | 対象 |
|------------|------|------|
| 毎日 UTC 15:00 (JST 00:00) | デモデータリセット | tenant_id=0のみ |

---

## 更新履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2025-06-25 | 1.0.0 | YOZAN Genesisドキュメント整備・商品複数仕入先対応（Migration 0013）|
| 以前 | 0.9.x | CCアドレス帳（Migration 0012）・Enterキー誤送信防止 |
| 以前 | 0.8.x | 同一顧客発注メール連続処理・URLSearchParams修正 |
| 初期 | 0.1.0 | 初期リリース（基本的な発注・入荷管理） |
