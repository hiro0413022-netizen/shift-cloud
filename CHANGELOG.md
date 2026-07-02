# CHANGELOG

## 2026-07-02
- docs: Phase 0完了。genesis共通ドキュメント9件、workforce-osドキュメント9件、PHASE0_PLAN.md作成
- 決定: DECISIONS #1〜#9
- infra: Supabaseプロジェクト`yozan-shift-cloud`作成（ap-northeast-1, ref: qrgpblnnhdudigarrtuz, 無料プラン）
- db: `0001_foundation.sql`適用（組織・権限・テンプレート・監査ログ 11テーブル＋RLS）。セキュリティアドバイザWARN 1件修正済み
- db: `0002_modules.sql`（シフト・勤怠・給与・運営・AI提案 14テーブル＋RLS）、`0003_seed.sql`（YOZAN/GOLF WING 4店舗・ロール6種・テンプレート11種・予定種別13種）適用
- app: 全機能実装（Phase 1〜6）。ログイン（メール/ログインID）、スタッフ・店舗・ブランド・会社・テンプレート・予定種別管理、スタッフ画面（ダッシュボード/希望提出/シフト閲覧/お知らせ）、シフトビルダー（募集→ドラフト→確定→通知）、iPadキオスク打刻、勤怠集計・打刻修正、月末照合、給与集計（再認証＋CSV）、本部ダッシュボード、AI提案（ルール生成＋承認）
- verify: `next build` 成功（27ルート、型チェック通過）
