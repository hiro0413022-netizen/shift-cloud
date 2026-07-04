# NEXT_TASKS

## GENESIS本番稼働開始（2026-07-04）

- 本番: https://yozan-genesis.vercel.app（Vercel `yozan-genesis`、Root: apps/genesis、env 3つ設定済み）
- push済み: commit f245bf6。Supabase migrations 0005/0006適用済み

## 要対応

0. **コーポレートサイト統合**: main復旧済み。apps/corporate統合済み・Vercel `yozan-corporate` 本番公開済み・モーションアップグレード実装済み（push待ちの場合あり）
0-a. **yozan-inc.jp DNS切替**: CloudflareアカウントトークンにZone>DNS>Edit権限がなくAPI編集不可。権限追加後に (1) `@` CNAME→`b86da20995ba7910.vercel-dns-017.com`(Proxyオフ) に変更 (2) その後Pages`yozan-group`からカスタムドメイン解除。MX(mail1026.onamae.ne.jp)は不変更
0-b. **golfwing/kallinosソース回収**: Cloudflare Pages 3プロジェクトは全てdirect-uploadでソースなし。Gensparkに「shift-cloudリポの新ブランチ `golfwing-src` / `kallinos-src` へpush（mainへのforce push厳禁）」を依頼 → 回収後 apps/ へ統合
0-c. **セキュリティ**: チャット共有されたCloudflare APIトークンは作業完了後に再発行。R2キーはR2未有効化のため失効推奨
1. **ログイン動作確認**（ユーザー）: オーナー/本部アカウント（view_hq権限）で https://yozan-genesis.vercel.app にログイン → Cockpit表示確認
2. **未コミットのdocs変更をcommit & push**（CHANGELOG / NEXT_TASKS / DECISIONS / package.json）
3. **Webhook接続テスト**: Connectors画面でGitHubのトークン発行 → GitHubリポジトリのWebhooksに `https://yozan-genesis.vercel.app/api/webhooks/github?token=xxx` を登録
4. **運用開始**: CEO AI Command Centerで日次レポート生成・AI指示生成を使い始める
5. （任意）Vercelの Function Region を東京(hnd1)に変更 — 現在iad1でSupabase東京との往復が遅め。Settings → Functions

## バックログ
- KPI実データ接続（payroll_items→人件費など）
- AIエージェント実行の自動記録（n8n/Cowork→ai_execution_logs）
- Shift Cloudの残項目: パスワードリセット / 有給・交通費申請 / LINE通知 / 給与丸め本番値（DECISIONS #9）
- 次期モジュール選定（MODULE_TEMPLATE.md参照: inventory / reservation / crm / caddy-dispatch / kallinos-ec / golf-coach-ai）

## メモ
- Supabase: yozan-shift-cloud (qrgpblnnhdudigarrtuz, 東京) — genesisも同一DB（DECISIONS #16）
- Shift Cloud本番: https://shift-cloud-shift-cloud.vercel.app
- Genesis入口条件: staff + view_hq権限ロール（DECISIONS #18）
