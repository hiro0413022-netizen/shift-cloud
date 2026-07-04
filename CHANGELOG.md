# CHANGELOG

## 2026-07-04
- ops: 旧Vercelプロジェクト`shift-cloud`削除（稼働は`shift-cloud-shift-cloud`のみ）。リポジトリはPublic運用と決定（DECISIONS #14）
- db: `0005_genesis_kernel.sql`適用 — Genesis Kernel 16テーブル（modules / company_events / business_memories / decision_logs / ai_agents / ai_execution_logs / development_statuses / risks / blockers / kpis / simulations / prompts / reports / connectors / webhook_logs / external_events）＋RLS＋トリガー
- db: `0006_genesis_seed.sql`適用 — モジュール9件・AIエージェント19体・KPI4件・コネクタ13件・開発状況2件・決定ログ#1〜#18バックフィル・初期イベント/記憶
- feat: `apps/genesis` 新規作成（Next.js、ポート3001） — Genesis Cockpit（リング型UI・状態モーション）/ CEO AI Command Center（開発状況・リスク・ブロッカー・承認待ち・AI指示プロンプト生成・日次レポート生成）/ Company Events / Business Memory / Decision Log / AI Agents / Approvals / Development Map / Future Simulation / Integration Mesh（Webhookトークン発行）
- feat: Webhook受信基盤 `POST /api/webhooks/{connector}?token=` — webhook_logs → external_events → company_events自動変換（sha256トークン認証）
- docs: `docs/genesis/MODULE_TEMPLATE.md`（Phase 5 モジュール追加テンプレート）
- 決定: DECISIONS #15〜#18
- 検証: apps/genesis next build成功（全13ルート）。デプロイは未実施（要承認）

## 2026-07-02 (2)
- deploy: GitHub `shift-cloud` → Vercel（https://shift-cloud-shift-cloud.vercel.app、Function Region: 東京）
- feat: シフト作成グリッドを時間表示（10:00-17:00形式）に変更
- feat: スタッフ主導フローに転換 — シフト提出が自動でドラフト化（管理者は確認→確定のみ）。`0004_help_requests.sql`適用: 出勤募集（help_requests/help_applications）を追加。管理画面「出勤募集」で作成→店舗スタッフに通知→応募→採用で確定シフト化＋通知、人数充足で自動クローズ
- 決定: DECISIONS #13

## 2026-07-02
- docs: Phase 0完了。genesis共通ドキュメント9件、workforce-osドキュメント9件、PHASE0_PLAN.md作成
- 決定: DECISIONS #1〜#9
- infra: Supabaseプロジェクト`yozan-shift-cloud`作成（ap-northeast-1, ref: qrgpblnnhdudigarrtuz, 無料プラン）
- db: `0001_foundation.sql`適用（組織・権限・テンプレート・監査ログ 11テーブル＋RLS）。セキュリティアドバイザWARN 1件修正済み
- db: `0002_modules.sql`（シフト・勤怠・給与・運営・AI提案 14テーブル＋RLS）、`0003_seed.sql`（YOZAN/GOLF WING 4店舗・ロール6種・テンプレート11種・予定種別13種）適用
- app: 全機能実装（Phase 1〜6）。ログイン（メール/ログインID）、スタッフ・店舗・ブランド・会社・テンプレート・予定種別管理、スタッフ画面（ダッシュボード/希望提出/シフト閲覧/お知らせ）、シフトビルダー（募集→ドラフト→確定→通知）、iPadキオスク打刻、勤怠集計・打刻修正、月末照合、給与集計（再認証＋CSV）、本部ダッシュボード、AI提案（ルール生成＋承認）
- verify: `next build` 成功（27ルート、型チェック通過）
