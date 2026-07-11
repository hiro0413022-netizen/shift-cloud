# MODULE_TEMPLATE — 新規業務モジュール追加テンプレート（Phase 5 / App Factory）

新モジュール（在庫・予約・CRM・キャディ派遣・KALLINOS EC・ゴルフコーチAI等）を追加するときは、このテンプレートを埋めてからAIに実装を指示する。CEO AI Command Centerの「AI指示プロンプト生成」と併用する。

## 1. モジュール定義

| 項目 | 内容 |
|------|------|
| コード | 例: `inventory`（modulesテーブルのcodeと一致させる） |
| 名称 | 例: 在庫・発注管理 |
| ドメイン | workforce / inventory / reservation / crm / ec / dispatch / ai / operation |
| 対象事業 | 例: GOLF WING工房・物販 |
| 主ユーザー | 例: 店舗責任者・本部 |
| 解決する課題 | 何が困っていて、何ができれば成功か |

## 2. 必要な設計（AIが自動提案する項目）

- **DB**: テーブル一覧。全テーブル共通: `id / company_id / created_at / updated_at / deleted_at`、RLSテナント分離（DATABASE_STANDARD準拠）
- **画面**: 一覧 / 詳細 / 作成・編集 / ダッシュボード
- **API**: Server Actions＋必要なら `/api/v1/*`（AIエージェントが同じ操作を呼べること）
- **権限**: 既存Permission体系に追加するフラグ（例: `manage_inventory`）
- **通知**: どのイベントで誰に通知するか（notifications再利用）
- **CSV/帳票**: 出力要件
- **KPI**: kpisテーブルに登録するコードと算出方法

## 3. Kernel接続（必須 — これがGenesisモジュールの条件）

- [ ] 重要操作を **company_events** に記録する（event_type命名: `{module}.{action}`）
- [ ] 学び・勝ちパターンを **business_memories** に残せる導線がある
- [ ] 重要判断は **decision_logs** に記録する
- [ ] 危険操作（削除・外部送信・課金）は **approval_requests** に回す
- [ ] 全ミューテーションが **audit_logs** に残る
- [ ] 担当AIエージェントを **ai_agents** に登録し、実行は **ai_execution_logs** に記録
- [ ] **development_statuses** に開発状況レコードを作成（CEO AIが進捗把握）
- [ ] 外部連携が必要なら **connectors** に登録（Webhookは `/api/webhooks/{code}` が受ける）

## 4. 実装手順（標準フロー / DECISIONS #35 scaffold対応）

1. modulesテーブルに行を追加（status: designing）
2. このテンプレートを埋めて docs/modules/{code}/ に保存
3. **雛形生成**: `npm run new-app -- --name <code>-os --title "<名称>" --prefix <接頭辞> --permission use_<code> --port 3xxx`
   - 生成物: ログイン・認可（@yozan/core）・レイアウト・`/api/v1/health`・ログアウト（独立アプリの勝ちパターン #30/#33/#34）
   - 入力面は独立アプリに置き、GENESIS側は閲覧＋承認のみ
4. migration追加（番号は supabase/migrations/README.md の台帳で最新+1。追加のみ・既存テーブル変更は要承認）
5. ドメイン機能を実装（金額integer円・時間integer分 #4、論理削除 #5、書込はservice_role+requireActor+監査 #11）
6. **金額に触れるロジックは tests/ にテストを追加**（node --test。CIが自動実行）
7. **`.github/workflows/ci.yml` の matrix.app に新アプリを追加**（忘れると型エラーがCIをすり抜ける）
8. デプロイ: OPERATIONS.md §7「新アプリ デプロイ定型チェックリスト」
9. development_statuses更新 → status: live でモジュール稼働、vault_systems登録（#26）
10. CHANGELOG.md・DECISIONS.md更新

### ⚠ 過去に踏んだ落とし穴（scaffold直後に必ず確認する）

| 症状 | 原因 | 対策 |
|---|---|---|
| ログインできない／ボタンが反応しない | `src/middleware.ts` の `export const config = { matcher: [...] }` が無い → 静的JSまで認証で307になる | scaffold直後に `middleware.ts` に `config` があるか目視 |
| `next build` が型エラー | Server Componentの `<form action={fn}>` に **戻り値がある関数**を渡した | フォームに直接渡すServer Actionは `Promise<void>` にする（クライアントから `await` する場合のみ戻り値OK） |
| CIの `npm test` が落ちる | tests/ の import に **`.ts` 拡張子が無い** | `from "../apps/xxx/src/lib/yyy.ts"` と拡張子付きで書く（node --test の型ストリップの制約） |
| 新アプリの型エラーがCIで検知されない | ci.yml の matrix に追加し忘れ | 手順7 |

## 5. モジュール別メモ（着手時に具体化）

### inventory（在庫・発注）
主テーブル: products / stock_levels / stock_movements / purchase_orders。発注提案はinventory_aiが作成→承認後発注。

### reservation（予約）
主テーブル: resources（打席/レッスン枠）/ reservations / reservation_rules。Smart Hello連携をconnectorsに追加予定。

### crm（会員CRM）
主テーブル: customers / memberships / customer_notes / trackman_sessions。退会リスクスコアはanalyst_aiが算出。

### caddy-dispatch（キャディ派遣）
主テーブル: caddies / dispatch_requests / assignments / invoices。シフト構造はShift Cloudのパターンを流用。

### kallinos-ec（KALLINOS EC）
主テーブル: ec_products / ec_orders / ec_inventory。Shopify連携をconnectors経由で。

### golf-coach-ai（ゴルフコーチAI）
主テーブル: swing_analyses / lesson_plans。TrackManデータ（trackman_sessions）を入力にlesson_ai/golf_coach_aiが提案生成。
