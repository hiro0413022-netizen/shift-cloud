# NEXT_TASKS

## 稼働開始済み（2026-07-04確認）

- 本番URL: https://shift-cloud-shift-cloud.vercel.app （Vercelプロジェクト `shift-cloud-shift-cloud`、最新commit 8cb17a0 がREADY）
- GitHub: hiro0413022-netizen/shift-cloud（push済み・Vercel連携済み）
- Supabase: bootstrap済み（auth 7ユーザー / staff 7 / stores 5）

## 要対応（優先順）

1. **旧Vercelプロジェクト `shift-cloud` の削除** — 重複・ビルドERROR状態。稼働中は `shift-cloud-shift-cloud` のみ。Chrome拡張接続時にClaudeが代行可（2026-07-04時点は未接続で保留）
2. **CHANGELOG.md の未コミット変更をcommit & push**（ユーザーPCで）
3. **実運用フィードバック反映**: 実際に使って見つかったUI/挙動の修正

※ リポジトリはPublicのまま運用と決定（2026-07-04、ユーザー判断）→ DECISIONS #14

## MVP後のバックログ（ROADMAP.md参照）
- パスワードリセット画面（現在リンクなし）
- 有給・交通費申請フロー / LINE通知 / 打刻の位置情報検証
- 給与丸めルール・割増率の本番値確認（DECISIONS #9）
- GENESIS Kernel Phase 1（company_events等の基盤）着手判断

## メモ
- Supabase: yozan-shift-cloud (qrgpblnnhdudigarrtuz, 東京)
- Vercel team: hironobu-s-projects (team_fHq85i7oGBV5Al2v3WCefrmm)
