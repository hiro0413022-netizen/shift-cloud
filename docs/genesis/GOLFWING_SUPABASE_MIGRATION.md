# GolfOrder (golfwing) Supabase移行設計書

> 作成: 2026-07-04 / ステータス: 承認済み・P1完了（migration 0007適用済み）
> 対象: apps/golfwing（Hono + Cloudflare D1 → Genesis inventoryモジュール）

## 1. 目的

GOLF WING発注管理システム（GolfOrder）をCloudflare D1からGenesis共通基盤（Supabase `yozan-shift-cloud` / ap-northeast-1）へ移行し、シフト・勤怠・給与（Shift Cloud）と発注・在庫データを同一DBで扱えるようにする。これによりGenesis KernelのKPI（仕入コスト・在庫回転）への実データ接続、店舗×スタッフ×発注の横断分析、AIエージェントによる発注提案が可能になる。

## 2. 現状（As-Is）

- 実行基盤: Cloudflare Pages + Functions（Hono 4 / TypeScript、SSR約10,000行）
- DB: D1 (SQLite) `golfwing-production`、テーブル10本
  - tenants / users（独自認証: username+password、is_admin）
  - suppliers / supplier_rules / products / product_suppliers
  - purchase_orders / purchase_order_items / receipts / receipt_items
- マルチテナント: tenant_id列による分離（migrations 0011）
- 機能: 発注メール自動生成、仕入先自動振り分け、ステータス管理（下書き→発注済→入荷待ち→完納）、残注追跡、Excel入出力（xlsxHelper）、デモモード
- 本番: golfwing-order.pages.dev（当面継続稼働）

## 3. 移行方針（To-Be）

**方式B: 段階移行（DB先行）を推奨**

| 方式 | 内容 | 評価 |
|---|---|---|
| A. フル書き換え | Next.js + Supabaseでshift-cloud同様に再実装 | 品質最高だが工数大。10K行の画面再現が重い |
| **B. DB先行移行** | HonoアプリをVercel(Node runtime)へ移植し、D1呼び出し層をPostgres(Supabase)クライアントに差し替え。UIはそのまま | 工数中・リスク低。Genesisデータ統合を最速で達成 |
| C. 現状維持+同期 | D1のままn8n等でSupabaseへ日次同期 | 二重管理・整合性リスク。非推奨 |

方式B完了後、画面を順次Next.js化（方式Aへ漸進）する。

## 4. スキーマ移行設計

D1(SQLite)→Postgres変換の要点:

- `INTEGER PRIMARY KEY` → `bigint generated always as identity`（既存IDは維持してインポート）
- `TEXT`日時列 → `timestamptz`（JST文字列をパース）
- boolean的INTEGER（is_admin, is_demo等） → `boolean`
- 新スキーマは `golfwing` スキーマに分離配置（public=Shift Cloud/Genesisと衝突回避）

Genesis統合マッピング:

- `tenants` → 廃止し `companies` / `stores` に統合（GOLF WINGの店舗はstores参照。デモテナントはseedで別company）
- `users` → 廃止し `staff` + Supabase Auth に統合（後述）
- `purchase_orders.created_by` → `staff.id` 参照に変更
- 商品/仕入先はGenesis KPI（仕入コスト）から参照できるようviewを提供: `golfwing.v_monthly_purchase_cost`

## 5. 認証移行

独自username/password → Supabase Auth（Shift Cloudと同一ユーザープール）。

- 権限ロール: 既存 `is_admin` → ロール `order_admin` / `order_user` をShift Cloudの権限テーブルに追加
- デモモード: `is_demo` company + RLSで書き込み拒否ポリシー（現行と同等の読み取り専用デモを再現）
- RLS: 全golfwingテーブルに `company_id`（+必要に応じstore_id）ベースのポリシー。Shift Cloudの既存ヘルパー関数を流用

## 6. データ移行手順

1. `wrangler d1 export golfwing-production --output=dump.sql`（ユーザーPC、要Cloudflare認証）
2. 変換スクリプト（sqlite→postgres: 型・日時・boolean変換、tenant_id→company_id/store_idマッピング表適用）
3. Supabaseへ `golfwing` スキーマ作成migration（0007_golfwing_schema.sql）+ データINSERT
4. 検証: 件数一致・残注一覧・月次発注金額の突合（現行画面 vs SQL）
5. 切替: Vercel版を並行稼働→検証OK後にgolfwing-order.pages.devからリダイレクト

## 7. アプリ移植（方式B）の作業項目

1. apps/golfwing に `@hono/node-server` or Vercel Edge対応アダプタ導入（Hono公式のVercelアダプタあり）
2. DB層抽象化: 現在の `c.env.DB.prepare(...)`（D1 API）呼び出し（api.ts/pages.tsに散在）を薄いクエリヘルパー経由に集約 → postgres.js実装に差し替え
3. セッション: 現行Cookie方式 → Supabase Auth セッションに置換（auth.ts 435行が対象）
4. Excel入出力・メール生成はロジック変更なし（xlsxHelper流用）
5. Vercelプロジェクト `golfwing-order`（Root: apps/golfwing）作成、env: SUPABASE_URL / SERVICE_ROLE（server側のみ）

## 8. 見積り・順序

| フェーズ | 内容 | 目安 |
|---|---|---|
| P1 | スキーマ設計確定 + migration作成（0007） | 1セッション |
| P2 | D1エクスポート→変換→投入→検証 | 1セッション |
| P3 | DB層差し替え + auth置換 + ローカル検証 | 2〜3セッション |
| P4 | Vercel並行稼働 + 本番切替 | 1セッション |

## 9. リスクと対策

- **SQLite方言依存**（`strftime`, `AUTOINCREMENT`, 暗黙型）: api.ts内SQL全数grepで洗い出しリスト化してから着手
- **D1本番データの鮮度**: 切替直前に再エクスポートして差分投入
- **メール送信**: 現行の送信手段（要確認: mailto生成のみか送信APIか）を移行前に特定
- **給与・シフトDBとの結合負荷**: golfwingスキーマ分離とview経由参照で影響を限定

## 10. 決定事項（2026-07-04 ユーザー回答 → DECISIONS #19/#20）

1. 方式B採用
2. 新規開発凍結: 許容
3. 店舗はGOLF WING宝塚のみ → stores.id `82bb4e18-427d-4cc7-a834-c9e2a9b18199`（GOLF WING 宝塚）に全データを紐付け。tenant_id=1→この店舗、tenant_id=0（デモ）は移行対象外
4. デモ環境: 廃止（インポート時にtenant_id=0のデータを除外）

## 11. 進捗

- [x] P1: `supabase/migrations/0007_golfwing_schema.sql` 作成・本番適用（2026-07-04）— golfwingスキーマ8テーブル+RLS+updated_atトリガー+KPIビュー v_monthly_purchase_cost
- [x] P2: データ移行完了（2026-07-04）— D1 API直読み→ブラウザ内変換→一時Edge Function `golfwing-import`（secretヘッダー認証）でgolfwingスキーマへ投入。件数検証一致: suppliers 27 / supplier_rules 135 / products 1748 / purchase_orders 31 / purchase_order_items 56 / receipts 29 / receipt_items 53。デモテナント(tenant_id=0)は除外、シーケンスはsetval済み、default_supplier_id等の孤児FKはnull化。KPIビュー動作確認済み
  - 注意: D1本番は稼働継続中 → P4切替直前に差分再同期（golfwing-import関数は残置、切替後に削除）
- [x] P3: 実装完了（2026-07-04）— `src/lib/pgdb.ts`（D1互換Postgresアダプタ: ?→$n変換、boolean/julianday/GROUP_CONCAT方言変換、INSERT自動RETURNING id、batch対応）、`api/index.ts`（Vercel Nodeエントリ）、`vercel.json`、auth.tsをSupabase Auth化（メール+パスワード、staffテーブル照合、env varフォールバック付き）、migration 0008でtenant_id互換列追加（既存SQL無修正）。デモログインは/loginへリダイレクト化。tsc --noEmit エラー0確認済み
  - TODO: isAdminは暫定全員true（rolesテーブル連携は後続）。バックアップ復元機能のINSERT OR REPLACEはON CONFLICT非対応（既知の制限）
- [ ] P4: Vercelプロジェクト`golfwing-order`作成（Root: apps/golfwing、Framework: Other、env 6つ）→ 動作検証 → D1差分再同期 → 切替。env: GW_DATABASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY / AUTH_SECRET / AUTH_USERNAME / AUTH_PASSWORD
