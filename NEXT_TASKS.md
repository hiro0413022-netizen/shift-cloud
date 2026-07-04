# NEXT_TASKS

## Genesis Kernel MVP実装完了（2026-07-04）— 次は稼働準備

1. **commit & push**（ユーザーPCで）
   ```
   git add -A
   git commit -m "feat: Genesis Kernel MVP（apps/genesis + migrations 0005/0006）"
   git push
   ```
2. **ローカル起動確認**（ユーザー作業）
   - `apps/genesis/.env.local` を作成（.env.example参照。shift-cloudと同じ3つのキー）
   - ルートで `npm install` → `npm run dev:genesis` → http://localhost:3001
   - Shift Cloudのオーナー/本部アカウント（view_hq権限）でログイン
3. **Vercelデプロイ**（要承認・ユーザー判断）
   - Vercelで新規プロジェクト作成 → 同じGitHubリポジトリをimport
   - Root Directory: `apps/genesis`、環境変数3つ（shift-cloudと同値）
4. **Webhook接続テスト**: Connectors画面でGitHubのトークン発行 → GitHubリポジトリのWebhooksに `https://（genesisのURL）/api/webhooks/github?token=xxx` を登録
5. **運用開始**: CEO AI Command Centerで日次レポート生成・AI指示生成を使い始める

## バックログ
- KPI実データ接続（payroll_items→人件費など）
- AIエージェント実行の自動記録（n8n/Cowork→ai_execution_logs）
- Shift Cloudの残項目: パスワードリセット / 有給・交通費申請 / LINE通知 / 給与丸め本番値（DECISIONS #9）
- 次期モジュール選定（MODULE_TEMPLATE.md参照: inventory / reservation / crm / caddy-dispatch / kallinos-ec / golf-coach-ai）

## メモ
- Supabase: yozan-shift-cloud (qrgpblnnhdudigarrtuz, 東京) — genesisも同一DB（DECISIONS #16）
- Shift Cloud本番: https://shift-cloud-shift-cloud.vercel.app
- Genesis入口条件: staff + view_hq権限ロール（DECISIONS #18）
