# YOZAN Genesis — Shift Cloud

シフト・勤怠・給与・店舗運営をひとつに。YOZAN Genesis（Company AI OS）の最初のモジュール。

## セットアップ（初回のみ）

```bash
# 1. 依存インストール（リポジトリルートで）
npm install

# 2. 環境変数
cd apps/shift-cloud
copy .env.example .env.local
# .env.local の SUPABASE_SERVICE_ROLE_KEY を設定
# （Supabaseダッシュボード https://supabase.com/dashboard/project/qrgpblnnhdudigarrtuz/settings/api-keys から取得）

# 3. 初期管理者（会社オーナー）を作成
set SUPABASE_SERVICE_ROLE_KEY=<service_roleキー>
node scripts/bootstrap-admin.mjs あなたのメール パスワード8文字以上 "氏名"

# 4. 起動
cd ../..
npm run dev
# → http://localhost:3000/login
```

DB（テーブル・シード）は適用済み。Supabaseプロジェクト: `yozan-shift-cloud`（東京）。

## 最初の操作フロー

1. オーナーでログイン → 管理画面
2. スタッフ管理でスタッフを追加（メールなしの場合はログインID＋パスワード）
3. シフト作成 → 対象月の「募集を開始」
4. スタッフがスマホでシフト希望をワンタップ提出
5. シフト作成グリッドで割当 → ドラフト保存 → 確定・通知
6. 打刻端末ページでiPad用URLを発行 → iPadで開く
7. 月末: 月末照合 → 給与（パスワード再認証）→ 集計 → CSV出力
8. 本部ダッシュボード: 店舗比較・AIチェック実行 → AI提案の承認/却下

## ドキュメント

- 全体方針: `docs/genesis/MASTER_PROMPT.md`
- 決定事項: `docs/genesis/DECISIONS.md`（開発前に必読）
- 次のタスク: `NEXT_TASKS.md` / 変更履歴: `CHANGELOG.md`

## デプロイ（Vercel）

- Root Directory: `apps/shift-cloud`
- 環境変数: `.env.example` の3つを設定
