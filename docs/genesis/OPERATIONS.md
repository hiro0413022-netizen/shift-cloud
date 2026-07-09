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
- 対象アプリ: yozan-genesis（Genesis） / shift-cloud-shift-cloud（Shift Cloud） / member-os（体験受付） / money-golfwing（お金管理） / shift-cloud-golfwing（GolfOrder） / yozan-corporate / kallinos — すべて同一リポジトリからビルドされる

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

### member-os（体験受付）の初回セットアップ（新Vercelプロジェクト）

1. https://vercel.com → **Add New… → Project** → 同じリポジトリ `shift-cloud` を選択
2. **Root Directory** を `apps/member-os` に設定（Framework: Next.js 自動検出）
3. Project Name は `member-os`（＝ member-os.vercel.app）
4. **Environment Variables** に3つ設定（値はGenesis/Shift Cloudと同じDBのもの）:

| Key | 用途 |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL（既存と同値） |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | anonキー（既存と同値） |
| SUPABASE_SERVICE_ROLE_KEY | service_roleキー（既存と同値） |

5. **Deploy**。以降は`git push`で自動再デプロイ（§1と同じ）
6. ログイン: `use_reception` または `view_hq` 権限を持つスタッフのみ。受付スタッフには Shift Cloud のロール設定で `use_reception` を付与（migration不要・権限キーを追加するだけ）

### money-golfwing（お金管理 / Money OS）の初回セットアップ（新Vercelプロジェクト）

前提: DBは適用済み（migration 0022_money_os）。あなたの作業は「push → Vercelプロジェクト作成 → 権限付与」の3つだけ。

1. **push**（§1）。money-golfwing のコードが main に入っていることを確認
2. https://vercel.com → **Add New… → Project** → 同じリポジトリ `shift-cloud` を選択
3. **Root Directory** を `apps/money-golfwing` に設定（Framework: Next.js 自動検出）
4. Project Name は `money-golfwing`（＝ money-golfwing.vercel.app）
5. **Environment Variables** に設定（値はGenesis/Shift Cloud/member-osと同じDBのもの）:

| Key | 必須 | 用途 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | ★ | Supabase URL（既存と同値） |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ★ | anonキー（既存と同値） |
| SUPABASE_SERVICE_ROLE_KEY | ★ | service_roleキー（既存と同値） |
| MONEY_SEGMENT_CODE | 任意 | このアプリが扱う事業。未設定なら `golf`（GOLF WING）。将来 姫路=`himeji` 等で別アプリに転用する時だけ設定 |

6. **Deploy**。以降は`git push`で自動再デプロイ（§1と同じ）
7. **アクセス権の付与**（2種類）:
   - **本部経理・経営層**（全事業を横断で見る/締める）: Shift Cloud のロール設定で `view_hq` または `manage_money_all` を付与（member-os の use_reception と同じ要領・migration不要）
   - **GOLF WING 現場スタッフ**（宝塚の売上・現金だけ入力）: `mon_grants` に「そのスタッフ × 事業=GOLF WING × role=input」を登録 → これは **Claudeに「○○さんにGOLF WINGの入力権限を」と伝えれば、C:MCP経由で追加**（あなたのUI作業は不要）
8. 初回ログイン確認: money-golfwing.vercel.app → 上記権限のあるアカウントでログイン → ダッシュボード/売上/現金出納/金種棚卸/カード・口座取込 の5メニューが出ればOK

### デプロイ後にClaudeがやること（あなたは確認のみ）

- `vault_systems` に「Money OS（お金管理）」の行を追加（URL: money-golfwing.vercel.app）
- `modules.money` を `designing` → `live` に更新
- AMEX/信金の全件CSV取込は、稼働後に画面の「カード・口座取込」からあなたがCSVをアップロード（手作業のバルク投入は不要）

### survey-os（アンケート / Survey OS）の初回セットアップ（新Vercelプロジェクト）

前提: DBは適用済み（migration 0030_survey_os、GOLF WINGアンケートは0031で投入済）。あなたの作業は「push → Vercelプロジェクト作成 → 権限付与」の3つ。

1. **push**（§1）。survey-os のコードが main に入っていることを確認
2. https://vercel.com → **Add New… → Project** → 同じリポジトリ `shift-cloud` を選択
3. **Root Directory** を `apps/survey-os` に設定（Framework: Next.js 自動検出）
4. Project Name は `survey-os`（＝ survey-os.vercel.app）
5. **Environment Variables** に設定（値はGenesis/member-osと同じDBのもの）:

| Key | 必須 | 用途 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | ★ | Supabase URL（既存と同値） |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ★ | anonキー（既存と同値） |
| SUPABASE_SERVICE_ROLE_KEY | ★ | service_roleキー（既存と同値） |
| NEXT_PUBLIC_SURVEY_ORIGIN | 任意 | QR/公開URLの生成元。未設定ならリクエストのホストを自動使用（通常は不要） |

6. **Deploy**。以降は`git push`で自動再デプロイ（§1と同じ）
7. **アクセス権**: アンケート管理（集計・CSV）は `view_hq` または `use_survey` 権限を持つスタッフのみ。※コーチ評価は機微情報のため既定は本部/オーナー（view_hq）想定。公開回答ページ `/s/[slug]` はログイン不要・匿名
8. 公開URL: `https://survey-os.vercel.app/s/golfwing-2026`（QRは管理画面の一覧カードに自動表示）。デプロイ後、Claudeが `vault_systems` のSurvey OS行にURLを記入

### reserve-os（ビジター予約 / Reserve OS）の初回セットアップ（新Vercelプロジェクト）

前提: DBは適用済み（migration 0032_reserve_os、シャフトFTサービスseed済）。あなたの作業は「Resend準備 → push → Vercelプロジェクト作成 → メールenv設定 → 通しテスト → LINE掲出」。

**A. Resend（メール送信）の準備**
1. https://resend.com にサインアップ（無料枠あり）
2. **Domains → Add Domain** で `yozan-inc.jp` を追加 → 表示されるDKIM/SPF等のDNSレコードを、お名前のDNS（またはメール管理先）に登録 → Resendで「Verified」になるまで待つ（数分〜数十分）
   - ※ドメイン認証をしないと迷惑メール扱いになりやすい。急ぐ場合はResendのテスト用送信元でも動くが本番はドメイン認証必須
3. **API Keys → Create API Key**（Full Access）→ 生成された `re_...` をコピー（この画面でしか表示されない）

**B. push**（§1）。reserve-os のコードが main に入っていることを確認

**C. Vercelプロジェクト作成**
4. https://vercel.com → **Add New… → Project** → 同じリポジトリ `shift-cloud` を選択
5. **Root Directory** を `apps/reserve-os` に設定（Framework: Next.js 自動検出）
6. Project Name は `reserve-os`（＝ reserve-os.vercel.app）
7. **Environment Variables** に設定:

| Key | 必須 | 値 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | ★ | Supabase URL（既存と同値） |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ★ | anonキー（既存と同値） |
| SUPABASE_SERVICE_ROLE_KEY | ★ | service_roleキー（既存と同値） |
| RESEND_API_KEY | ★ | AでコピーしたResendキー `re_...` |
| RESERVE_FROM_EMAIL | ★ | `info@yozan-inc.jp`（送信元＝YOZAN） |
| RESERVE_STAFF_EMAIL | ★ | GOLF WINGの受信用メールアドレス（申込通知の宛先） |
| NEXT_PUBLIC_SITE_URL | 任意 | `https://reserve-os.vercel.app`（メール内リンク用。デプロイ後に確定URLを設定） |

8. **Deploy**。以降は`git push`で自動再デプロイ。`NEXT_PUBLIC_SITE_URL` は本番URL確定後に入れて再Deploy
9. **アクセス権**: 予約管理（/、/requests）は `use_reception` または `view_hq` を持つスタッフのみ（member-osと同じ権限）。公開予約ページ `/reserve/[slug]` はログイン不要

**D. 通しテスト**
10. `https://reserve-os.vercel.app/reserve/shaft-fitting` を開き、テスト申込を送信 → GOLF WING宛（RESERVE_STAFF_EMAIL）に通知メール、申込者宛に受付確認メールが届くことを確認
11. `/login`（use_reception|view_hq）→ 一覧に申込が出る → 詳細で候補日時を選び「この日時で確定する」→ 申込者に確定メールが届く（このメールへの返信はGOLF WING宛に届く）

**E. 公式LINEに掲出**
12. LINE公式アカウントのリッチメニュー/あいさつメッセージに公開URL `https://reserve-os.vercel.app/reserve/shaft-fitting` を設定
13. デプロイ後、Claudeが `vault_systems` のReserve OS行に本番URLを記入（またはユーザーが /vault で更新）

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

## 6. LINE公式アカウント連携（Messaging API 有効化）

設計は DECISIONS #29。あなたの作業はこの節の Phase 0 だけ。トークンが揃えば残り（n8n受信ワークフロー）はClaudeが構築する。

### Phase 0 — Messaging API を有効化してトークンを取る（所要 約15分）

1. **LINE Official Account Manager**（https://manager.line.biz）に、運用中のGOLF WING公式アカウントでログイン
2. 右上 **設定（歯車）** → 左メニュー **Messaging API** → **Messaging APIを利用する** をクリック
3. プロバイダーを選択/新規作成（例: `YOZAN`）→ 規約同意して有効化。これで自動的に **LINE Developers** 側にチャネルが作られる
4. **チャネルシークレット（Channel secret）** を控える: LINE Official Account Managerの Messaging API 画面、または https://developers.line.biz → 該当チャネル → **Basic settings** タブに表示
5. **チャネルアクセストークン（長期）** を発行: developers.line.biz → 該当チャネル → **Messaging API** タブ → 「Channel access token (long-lived)」の **Issue/発行** → 表示された文字列を控える
6. Claudeに「LINEのトークン発行できた」と伝える（**シークレット/トークンの文字列はチャットに貼らない**。次の手順でn8nとVaultに直接入れる）

※ この時点では Webhook URL はまだ空でよい。Claudeがn8nワークフローを作るとURLが決まるので、それを developers.line.biz の Messaging API → **Webhook URL** に貼り、**Webhookの利用=オン**、**応答メッセージ=オフ**（自動応答を切る）に設定する（手順はClaudeが都度案内）。

### Phase 0b — Vault登録（#26）

- Claudeが `vault_systems` に「LINE公式アカウント（GOLF WING）」の行を作成 → あなたは `/vault` を開き、channel secret / channel access token をページ上のフォームに入力・保存（AIは値を記載しない）

### 以降のフェーズ（Claude構築、あなたは確認のみ）

- **A 顧客対応集約**: LINEに来た問い合わせが Command Center の CEO Inbox（/inbox）に自動で並ぶ → あなたは返信案を承認するだけで返信送信
- **B 体験予約取込**: LINEリッチメニュー「体験予約」→ member-os の入力フォームへ誘導（体験予約数KPIが自動集計）
- **C 配信**: SNS AIが作ったお知らせを承認 → LINE一斉配信
- **D Instagram**: 後続
