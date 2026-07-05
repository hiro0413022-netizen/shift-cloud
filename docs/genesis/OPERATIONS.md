# OPERATIONS — 運用手順書（ユーザー作業の完全ガイド）

Claudeセッションが「ユーザー作業」を依頼するとき、この手順書の該当節を参照する形にする。
同じ説明を毎回チャットで繰り返さないこと（このファイルが正）。

---

## 1. push（コード変更の本番反映）

Claudeはサンドボックス制約によりpushできない（過去のforce push事故też踏まえユーザーPCからのみ）。

```powershell
cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
git log --oneline -1   # Claudeが伝えたコミットIDと一致するか確認
git push origin main
```

- pushするとVercelが自動ビルド（1〜2分）。確認: https://vercel.com → 該当プロジェクト → Deployments が「Ready」
- 対象アプリ: yozan-genesis（Genesis） / shift-cloud-shift-cloud（Shift Cloud） / shift-cloud-golfwing（GolfOrder） / yozan-corporate / kallinos — すべて同一リポジトリからビルドされる

## 2. Vercel環境変数の追加・変更

1. https://vercel.com にログイン → プロジェクト（例: `yozan-genesis`）を開く
2. 上部タブ **Settings** → 左メニュー **Environment Variables**
3. **Key** と **Value** を入力 → Environments は「All Environments」のまま → **Save**
4. 反映には再デプロイが必要: **Deployments** タブ → 最新の行の右端「…」→ **Redeploy** → 確認ダイアログで Redeploy

### yozan-genesis の環境変数一覧

| Key | 必須 | 用途・作り方 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | 済 | 設定済み |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | 済 | 設定済み |
| SUPABASE_SERVICE_ROLE_KEY | 済 | 設定済み |
| CRON_SECRET | ★ | 毎朝6時の自動報告の認証。ランダム文字列。PowerShellで生成: `-join ((48..57)+(97..122) | Get-Random -Count 32 | % {[char]$_})` |
| ANTHROPIC_API_KEY | 推奨 | CEO AIのClaude分析。https://console.anthropic.com → Settings → API Keys → Create Key（`sk-ant-`で始まる値）。未設定でもルールベースで動作 |
| CEO_AI_MODEL | 任意 | 分析モデル変更用（既定: claude-haiku-4-5-20251001） |

## 3. 動作確認（CEO AI）

1. https://yozan-genesis.vercel.app → Command Center → **日次レポート生成** を押す
2. レポート末尾の「生成: CEO AI（**Claude分析**）」表示ならAPI接続成功（「ルールベース」ならANTHROPIC_API_KEY未反映）
3. 自動実行はVercel Cron（毎朝6:00 JST）。手動テスト: `curl -H "Authorization: Bearer <CRON_SECRET>" https://yozan-genesis.vercel.app/api/cron/daily`
4. CEO AIの指示案: Command Center「生成済みプロンプト」に【CEO AI→○○AI】として届く

## 4. Supabase（DB）

- migrationはClaudeがMCP経由で直接適用する（ユーザー作業なし）
- ダッシュボード: https://supabase.com/dashboard → プロジェクト qrgpblnnhdudigarrtuz

## 5. 日課（Genesis実運用）

- 朝: Cockpitを開く → スコアと「今日、判断すべきこと」を確認（レポートは6時に自動生成済み）
- 月次: 税理士の試算表が届いたら /finance に入力（またはCSV取込）→ 売上・利益・人件費率KPIが自動更新
- KPIの現在値・目標値の変更: Command Center「KPI手動更新」
