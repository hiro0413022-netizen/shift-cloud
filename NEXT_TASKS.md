# NEXT_TASKS

## MVP実装完了（2026-07-02）— 次は稼働準備

1. **ローカル起動・動作確認**（ユーザー作業）
   - `npm install` → `.env.local`にservice_roleキー設定 → `node scripts/bootstrap-admin.mjs` → `npm run dev`
   - README.md の「最初の操作フロー」を一巡
2. **GitHubリポジトリ作成＆push** — リポジトリ名: `shift-cloud`（決定済み）。ユーザーのPCで git init → push（サンドボックスからは不可）
3. **Vercelデプロイ** — GitHub連携でimport、Root Directory: `apps/shift-cloud`、環境変数: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY（.env.example参照）/ SUPABASE_SERVICE_ROLE_KEY。ルートに`vercel.json`あり（CLI直デプロイ用）
4. **実データ投入**: GOLF WING 4店舗のスタッフ登録
5. **フィードバック反映**: 実際に使って見つかったUI/挙動の修正

## MVP後のバックログ（ROADMAP.md参照）
- パスワードリセット画面（現在リンクなし）
- 有給・交通費申請フロー / LINE通知 / 打刻の位置情報検証
- 給与丸めルール・割増率の本番値確認（DECISIONS #9）

## メモ
- Supabase: yozan-shift-cloud (qrgpblnnhdudigarrtuz, 東京)
- 検証済み: next build成功。実ログイン・打刻フローはbootstrap後に要確認
