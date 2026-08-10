# OPERATIONS — 運用手順書（ユーザー作業の完全ガイド）

Claudeセッションが「ユーザー作業」を依頼するとき、この手順書の該当節を参照する形にする。
同じ説明を毎回チャットで繰り返さないこと（このファイルが正）。

---

> **改訂方針（#78 2026-07-25・REDESIGN §7）**: 本書のユーザー作業は**原則AIが実行**する（commit/push/デプロイ/env調査/検証/ビルド確認まで）。古川さんに残るのは①外部サービスの管理画面でしか作れない秘密情報の発行（LINEチャネル・Vercelトークン/Deploy Hook等）②実機・店頭での動作確認③法務・契約の最終判断④物理作業、の4種のみ。依頼時は「どこで・何を・何分」を明記する。

## 1. commit & push（コード変更の本番反映）

**通常はClaudeが自動でcommit & pushする**（PAT＋credential helperを `.git` に設定済み。2026-07-14に自動push実証）。pushするとVercelが自動ビルド＝デプロイまで自動。ユーザー作業は不要。

> ⚠️ **Claudeが守る手順（これを外すとファイルが壊れる）**
> サンドボックスから見えるプロジェクトフォルダは、**日本語を含むファイルが途中で切れて見える**（`git status` が身に覚えのない大量の削除を出したらこれ）。そのまま `git add -A` すると**切れた内容がコミットされる**（過去に `templates/app-template/src/middleware.ts` が349バイトで途切れた事故）。
> ①編集した各ファイルの正しい全文をVM側に書き直してから（Readで取得→ヒアドキュメント、または `git show HEAD:<path>` を起点にパッチ適用）ステージする
> ②`git add` は**変更したパスだけを明示**（`-A` は使わない）
> ③`git diff --cached --stat` が想定どおりの行数か確認してから commit → push
> ④force pushは使わない

ユーザーPCで手動実行する場合（Claudeが不調・確認したい時のみ）:

```powershell
cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
node scripts/check-files.mjs   # 途中で切れたファイルがないか検査（0件ならOK）
git status --short
git add -A
git commit -m "コミットメッセージ（Claudeが提示）"
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

### Phase 0b — Vault登録（#26 / 自動化 #61）

- Claudeが `vault_systems` に「LINE公式アカウント（GOLF WING）」の行を作成し、**channel secret / channel access token を Claude がMCP経由で直接保存**（`secret_source='external'`, `managed_by='ai'`）。トークンをClaudeに渡せば、`/vault` への手入力は不要。
  - 値はチャットに残るため、渡した後にトークンを再発行したい場合はLINE Developersで再Issueして差し替え可（`app.gen_secret()` は外部発行値には使わない）。

### 以降のフェーズ（Claude構築、あなたは確認のみ）

- **A 顧客対応集約**: LINEに来た問い合わせが Command Center の CEO Inbox（/inbox）に自動で並ぶ → あなたは返信案を承認するだけで返信送信
- **B 体験予約取込**: LINEリッチメニュー「体験予約」→ member-os の入力フォームへ誘導（体験予約数KPIが自動集計）
- **C 配信**: SNS AIが作ったお知らせを承認 → LINE一斉配信
- **D Instagram**: 後続

## 7. 新アプリ デプロイ定型チェックリスト（これが正典。個別アプリの手順は§2の各節を参照）

新しい独立アプリ（member-os / survey-os / reserve-os 型）を本番に出すときは、毎回このコピペで終わる。所要 約10分。

**あなたの作業:**

1. **push**: リポジトリのルートで `npm install` → `git add -A` → `git commit`（済みのことが多い）→ `git push`
2. **Vercel新規プロジェクト作成**: https://vercel.com/new → リポジトリ `yozan-genesis` をImport →
   - Project Name: アプリ名（例: `reserve-os`）
   - **Root Directory: `apps/<アプリ名>`**（これを忘れると動かない）
   - Environment Variables に最低3つ:
     - `NEXT_PUBLIC_SUPABASE_URL`（既存プロジェクトと同じ値）
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`（同上）
     - `SUPABASE_SERVICE_ROLE_KEY`（同上）
     - ＋アプリ固有のenv（メール送信ならRESEND系等。各アプリのREADME/NEXT_TASKSに記載）
   - Deploy を押す
3. **権限付与**: 使うスタッフに専用権限（`use_reception` / `use_survey` / `use_legal` 等）を付与（§8）。view_hq保持者（あなた）は付与不要で入れる
4. **動作確認**: ログイン→主要1画面→（公開ページがあれば）公開URLを開く

**Claudeの作業（デプロイ後に依頼）:**

5. `vault_systems` にURL・ID・**パスワードまで**Claudeが登録（#26/#61）。AIが発行するログイン等は `app.gen_secret()` で自動生成し `secret_source='generated'`・`managed_by='ai'`。外部プロバイダ発行値は渡してくれれば `secret_source='external'` で直接保存。手入力は原則不要
6. modulesテーブルを `live` に更新、CHANGELOG/NEXT_TASKSを更新

## 8. 権限の付与手順（use_reception / use_survey / use_legal / view_hq 等）

権限はDBの `roles.permissions`（JSON）にフラグとして入っており、スタッフにはロール経由で付く。

- **一番簡単な方法**: Claudeに「○○さんに use_survey を付けて」と伝える → MCP経由でロール付与のSQLを実行（本番DB変更なのであなたの承認後）
- **自分でやる場合（Shift Cloud管理画面）**: Shift Cloud → スタッフ管理 → 対象スタッフ → ロール編集 → 該当権限を含むロールを割り当て。該当ロールが無ければ「ロール管理」で新規ロールを作成し permissions に `{"use_survey": true}` 等を設定
- **注意**: `view_hq` は経営層専用（Genesis本体に入れる権限 #18）。現場スタッフには各アプリの `use_*` だけを付ける
- 給与系（`view_payroll` / `manage_payroll`）は追加認証付き（#3の例外）。付与は慎重に

## 9. Instagram連携（AI営業 SNSインバウンド #101）

自動投稿の開通に必要なのは env 2つだけ。未設定の間も生成・承認は動き、投稿は「予約のまま待機」します（設定した瞬間に自動開通）。
**アカウント2つ分（@swingcortex_jp / @yozan_web_jp）を同じ手順で繰り返します**（env名だけ変える・§9-4の表）。所要 1アカウント約30分。

### 9-1. Instagram側（スマホ・約5分／アカウントごと）

1. Instagramアプリ → 該当アカウントに切替 → 右下プロフィール → 右上「≡」→ **設定とプライバシー**
2. **アカウントの種類とツール** → **プロアカウントに切り替える** → カテゴリ（例: 商品/サービス）→ **ビジネス**を選択
3. 続けて **Facebookページにリンク** を求められるので、YOZANのFacebookページに接続（無ければその場で新規作成でよい／ページ名は任意）
   - 既にプロアカウントの場合: 設定 → **ビジネス** → **Facebookでシェア/ページをリンク** から接続状況を確認
   - **ここでFacebookページと繋がっていないとAPIから投稿できません**（一番よくある詰まりどころ）

### 9-2. Meta開発者アプリの作成（PC・初回1回だけ）

2アカウント目は同じアプリを使い回せます（アプリ作成は1回でOK）。

4. https://developers.facebook.com → 右上 **マイアプリ** → **アプリを作成**
5. ユースケースは **「他の設定」→ ビジネス**（表記はUI改定で揺れます。要するに空のビジネスアプリ）→ アプリ名 `YOZAN Genesis` など → 作成
6. 左メニュー **アプリの追加/製品を追加** → **Instagram（Instagram Graph API）** を「設定」

### 9-3. トークンとIDの取得（PC・アカウントごと約10分）

7. https://developers.facebook.com/tools/explorer （グラフAPIエクスプローラ）を開く
8. 右上「Metaアプリ」で作成したアプリを選択 → 「ユーザーまたはページ」で **ユーザーアクセストークン**
9. **アクセス許可を追加** で次の3つにチェック:
   `instagram_basic` / `instagram_content_publish` / `pages_show_list`
   （`pages_read_engagement` も出れば付けておくと安全）
10. **アクセストークンを生成** → Facebookのログイン画面 → 対象のFacebookページとInstagramアカウントに**すべてチェックを入れて許可**（1つでも外すと後でIDが取れません）
11. エクスプローラのURL欄に `me/accounts` と入れて送信 → 返ってきたJSONから該当ページの `id`（＝ページID）をコピー
12. URL欄に `{ページID}?fields=instagram_business_account` と入れて送信 → `instagram_business_account.id` が **IGビジネスアカウントID**（これが `IG_BUSINESS_ID`）
13. **長期トークンに交換**（生成直後のトークンは1〜2時間で切れます）:
    - https://developers.facebook.com/tools/debug/accesstoken/ にトークンを貼って **デバッグ** → 下部 **アクセストークンを延長**（Extend Access Token）
    - 出てきた長い文字列が `IG_ACCESS_TOKEN`（有効期限 約60日）

### 9-4. Vercelに登録（§2の手順・約5分）

14. Vercel → `yozan-genesis` → Settings → Environment Variables に、アカウントごとに2つずつ登録:

| アカウント | 投稿する商品 | Key |
|---|---|---|
| @swingcortex_jp | swing-cortex / pganote | `IG_ACCESS_TOKEN` / `IG_BUSINESS_ID` |
| @yozan_web_jp | webdesign（HP制作） | `IG_ACCESS_TOKEN_WEB` / `IG_BUSINESS_ID_WEB` |

15. Deployments → 最新の「…」→ **Redeploy**（envは再デプロイで初めて反映）
16. 確認: **/ai-sales**（AI営業 司令室）の上部警告が消える → 承認済み投稿が次の18:00（過ぎていれば10分以内）に自動投稿される
17. Instagramプロフィールの**リンク**に対応LPを設定: @swingcortex_jp → `/lp/swing-cortex`、@yozan_web_jp → `/lp/webdesign`

※ 長期トークンは約60日で失効します。失効すると /ai-sales の投稿が failed になり理由が表示されるので、再取得して env を差し替えてください（自動更新は残タスク）。

※ アカウントは2つあります（#101補足）。**アプリ作成（9-2）は共通で1回**、**9-1と9-3をアカウントごとに繰り返し**、9-4でenv名を変えて登録します。片方だけ設定した状態でも安全で、未設定のアカウント分は「予約のまま待機」します。

※ よくあるエラー: `(#200) Requires instagram_content_publish permission` → 手順10でチェックを外した／`instagram_business_account` が返らない → 9-1のFacebookページ接続ができていない。どちらも /ai-sales の投稿カードに理由が出ます。

## 10. X（旧Twitter）連携（AI営業 SNSインバウンド #103）

**2026-08-05 接続済み**。以下は再設定・キー更新が必要になったときの手順です。

投稿先は**会社公式1アカウント `@YOZAN_inc`**（全事業を集約。Instagramのように商品別に分けない — Xは本文にリンクを置けるため）。

### 10-1. 前提（済み）

- X開発者アカウント `YOZAN Inc.`（従量課金 Pay Per Use）: https://console.x.com
- アプリ `2084867281931124736YOZAN_inc`（appId 33278037）
- **アプリ権限=「読み取りと書き込み」／種類=「ウェブアプリ、自動化アプリまたはボット」**
- クレジット残高$5・自動チャージON（残高$1未満で$10課金）

### 10-2. キーの取得・更新（console.x.com → アプリ → Keys & Tokens）

1. **コンシューマーキー / シークレット**（＝`X_API_KEY` / `X_API_SECRET`）
   - 目のアイコンでは末尾しか見えません。**「再生成」を押すと1度だけ全体が表示**されます（＝再生成が実質の確認手段）
2. **アクセストークン / シークレット**（＝`X_ACCESS_TOKEN` / `X_ACCESS_SECRET`）
   - 「生成する / 再生成」で1度だけ表示。**必ずその場でコピー**
   - ⚠ アプリ権限を変更したら**アクセストークンを再生成**すること（古いトークンは古い権限のまま＝書き込みで403）
3. Vercel（yozan-genesis）→ Settings → Environment Variables に4つ登録 → **Redeploy**
4. 確認: /ai-sales の「X @YOZAN_inc 未接続」警告が消える

### 10-3. 費用（従量課金・2026年2月〜）

- 投稿 **$0.015/件**、**リンクを含む投稿は $0.20/件**、最低チャージ$5
- 本システムは1日1本・LPリンク付き → **月30本で約$6（約900円）**
- 使いすぎ防止は console.x.com →「クレジット」→「支出上限を管理」。自動チャージのON/OFFも同じ画面

### 10-4. エラーの見分け方（/ai-sales の投稿カードに日本語で出ます）

| HTTP | 意味 | 対処 |
|---|---|---|
| 401 | 署名不一致 | キー4つのどれかがズレている（再生成後にenv未更新が典型） |
| 403 | 権限か残高 | アプリ権限が「読み取りのみ」／トークンが権限変更前のまま／クレジット残高切れ |
| 429 | レート制限 | 放置でOK（次の10分tickで再試行） |

## 11. demo-sales の自動ピックアップを動かす（#110）

営業先の自動巡回（毎日 JST 5:00 / 8:00）は **demo-sales プロジェクトの Vercel Cron** が動かします。
Genesis とは**別プロジェクト**なので、環境変数も別に設定が必要です。

### 11-1. CRON_SECRET（必須・これが無いと動きません）

Vercel は `CRON_SECRET` という名前の環境変数があると、cron実行時に自動で
`Authorization: Bearer <その値>` を付けて自分のエンドポイントを叩きます。
`/api/cron/prospect` はこのヘッダを検証し、一致しなければ401を返します（＝外部から叩かれても実行されない）。

1. https://vercel.com → プロジェクト **demo-sales** を開く（`yozan-genesis` ではないので注意）
2. **Settings** → **Environment Variables**
3. Key: `CRON_SECRET` ／ Value: ランダムな40文字程度。Environments は「All Environments」
   - 値は Genesis と**同じでなくてよい**（プロジェクトごとに独立。むしろ分けたほうが安全）
   - PowerShellで生成: `-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})`
4. **Save** → **Deployments** タブ → 最新の行の「…」→ **Redeploy**

**確認**: demo-sales →「営業先の自動ピックアップ」→「いま1回だけ試す」で実行ログの行が増えれば、
アプリ側は正常。cron経由の確認は翌朝5時以降に同じ画面の実行ログを見る（`prs_runs` に必ず1行残る設計）。

### 11-2. 任意の環境変数

| Key | 無いとどうなるか |
|---|---|
| `GOOGLE_PLACES_API_KEY` | Google Places の巡回元だけ自動で見送られる。公開名簿の巡回は動く。取得: https://console.cloud.google.com → APIとサービス → Places API (New) を有効化 → 認証情報 → APIキー |
| `PAGESPEED_API_KEY` | 表示速度の採点をHTML取得時間で代用する（他の項目は影響なし）。取得: 同じGoogle Cloudで PageSpeed Insights API を有効化。無料枠あり |
| `PROSPECT_MAX_NEW` / `PROSPECT_MAX_AUDITS` / `PROSPECT_DEMO_SCORE_MIN` / `PROSPECT_MAX_DEMOS` | 既定値（30 / 25 / 55 / 3）で動く。拾う件数や自動デモの基準を変えたいときだけ設定 |

⚠ APIキー・シークレットの**入力欄への貼り付けはご本人が行ってください**（#103のルール。AIは入力しません）。

## 12. 営業メールを送れるようにする（#111）

②営業メール（`@yozan/outreach`）は **送信ドメインの認証が終わるまで動きません**（既定でOFF）。
認証前に送ると迷惑メール判定され、`yozan-group.jp` 本体のメールまで届かなくなるためです。

### 12-1. Resendのアカウントとドメイン認証（ユーザー作業・約20分＋DNS反映待ち）

1. https://resend.com にログイン（未登録なら Sign up）
2. **Domains → Add Domain** → `send.yozan-group.jp` を入力（**本体の yozan-group.jp ではありません**）
3. 表示される **DNSレコード3種**（MX / TXT(SPF) / TXT(DKIM)）をメモ
4. お名前.com のDNS設定（ドメイン Navi → DNS → DNSレコード設定）で、`yozan-group.jp` に上記を登録
   - ホスト名は `send` や `resend._domainkey.send` のようにサブドメイン部分だけを入れます
   - 既存の `yozan-group.jp` のMX（お名前レンタルサーバー）は**触らない**。触ると既存メールが止まります
5. Resendの画面で **Verify** → すべて緑になれば完了（反映に数分〜数時間）
6. **API Keys → Create API Key**（Sending access）→ 値をコピー

### 12-2. Vercel（demo-sales）に登録

§2の手順で以下を追加 → **Redeploy**。

| Key | 値 |
|---|---|
| `RESEND_API_KEY` | 12-1 でコピーしたキー |
| `RESEND_WEBHOOK_SECRET` | 12-3 で取得（後からで可） |

### 12-3. 配信結果の通知（Webhook）

1. Resend → **Webhooks → Add Webhook**
2. Endpoint: `https://demo-sales-delta.vercel.app/api/webhooks/resend`
3. Events: `email.sent` / `email.delivered` / `email.opened` / `email.bounced` / `email.complained`
4. 表示される **Signing Secret**（`whsec_` で始まる）を `RESEND_WEBHOOK_SECRET` に登録 → Redeploy

これが無いと「届いたか・迷惑報告されたか」が分からず、**自動停止も効きません**。

### 12-4. 送信をONにする

1. demo-sales → **営業メールの送受信**（`/outreach`）
2. 「送らずに内容を確認」を押し、送信対象の件数と文面を確認
3. 文面を必要なら編集（会社の住所・配信停止リンクは自動で付くので本文に書かない）
4. 「自動送信を有効にする」にチェック → 保存

以後、毎日10時（JST）に自動送信されます。初日10通・1日10通ずつ増え、上限で頭打ち。
宛先不明が8%を超える、または迷惑メール報告が2件に達すると自動で停止し、画面に理由が出ます。

### 12-5. 送受信の確認場所

- **送った・届いた・開かれた**: `/outreach` の送信ログ
- **先方からの返信**: info@yozan-group.jp（hiro0413022@gmail.com へ転送済み）→ Gmailで読む
- **デモが開かれた**: Genesisホームの判断フィード（開封直後の架電がもっとも繋がります）

## 13. 営業リストを業種を選ばず取れるようにする（#117）

名簿巡回は「業界団体が名簿を公開している業種」にしか使えません。美容室・エステ・飲食などに広げるには
**Google Places API** が要ります。あわせて、名簿サイトの読み取りをAIに任せると設定なしで拾えるようになります。

### 13-1. Google Places API のキー（ユーザー作業・約10分）

1. https://console.cloud.google.com → プロジェクトを選択（無ければ作成）
2. 「APIとサービス」→「ライブラリ」→ **Places API (New)** を検索して**有効にする**
3. 「APIとサービス」→「認証情報」→「認証情報を作成」→ **APIキー**
4. 作成されたキーの「キーを制限」→ **APIの制限** で Places API (New) だけを選ぶ（漏れたときの被害を限定）
5. Vercel の **demo-sales** に `GOOGLE_PLACES_API_KEY` として登録（§2の手順）→ Redeploy

**費用**: Text Search は月5,000リクエストまで無料（2025年3月に$200クレジットは廃止され、SKUごとの無料枠に変更）。
1リクエストで最大20件返るので、通常の使い方なら無料枠に収まります。念のため Google Cloud の
「お支払い」→「予算とアラート」で上限アラートを設定しておくと安全です。

### 13-2. AIで名簿を読む（任意）

Vercel の **demo-sales** に `ANTHROPIC_API_KEY` を登録すると、規則で読めなかった一覧ページをAIが読みます
（Genesisで使っているキーと同じもので構いません）。

- 巡回元ごとに「読み取り方」を選べます: **自動**（規則→ダメならAI・既定）／規則のみ／AIで読む
- 費用は一覧1ページあたり数円（Haikuで数万文字）。1回の呼び出しで数百件を処理します
- ⚠ **AIは一覧に書いてあることを写すだけ**で、事業所を探させてはいません。書かれていない屋号は
  自動で除外されます（実在しない宛先が営業リストに混ざるのを防ぐため）

### 13-3. 巡回元の増やし方

- **Places**: 「取得方法＝Google Places API」＋検索語（例: `美容室 伊丹市`）。業種とエリアを変えて数を作る
- **名簿**: 「取得方法＝公開名簿ページを巡回」＋一覧ページURL。読み取り方は「自動」でよい

---

## 14. FRANK GOLF 9/2オープンの残り設定（#118）

オープンまでにユーザー作業が要るのはこの4つ。**どれも「未設定でもサイトや予約は落ちない」設計**なので、
できたものから順に有効化すれば大丈夫です。

### 14-1. Square（月会費＋店頭レジ・最重要）

**#123で月会費もSquareに一本化しました（Stripeは廃止・本番鍵の設定は不要になりました）。**
店頭POS・物販・飲食・月会費が全部Square 1社＝入金・手数料・管理画面が1本になります。

1. https://squareup.com/jp のアカウントで法人確認を完了する（未完なら。数日かかる）。
   端末は Square Terminal 推奨（約4.6万円）
2. https://developer.squareup.com → Sign in → アプリを1つ作成（名前例: YOZAN Genesis）→
   **Production の Access Token** を控える
3. 初期設定スクリプトを実行（何度実行しても安全）:
   `SQUARE_ACCESS_TOKEN=EAAA... node scripts/frank-square-setup.mjs`
   これが自動でやること: ①消費税10%（内税） ②ドリンクメニュー3カテゴリ24品（一般/会員の2価格）
   ③サブスクプラン「FRANK GOLF 月会費」5種（税込・毎月） ④Webhook購読（payment/refund/subscription）
4. スクリプトが最後に出力する値を設定:
   - Vercel（yozan-genesis）: `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` / `SQUARE_WEBHOOK_SIGNATURE_KEY` → Redeploy
   - Supabase: frunk_plans.square_variation_id の update文を実行
5. テスト: booking.html から自分のカードでモニター以外のプランを1件登録 →
   frunk_members.billing_status='active'、Money OS の売上（姫路・月会費）に自動で1行入ることを確認
6. 物販（ゴルフ用品等）は Square ダッシュボード → 商品ライブラリ に追加していく（税込価格）。
   ドリンクは登録済み。レジでは会員に「会員」バリエーションを選ぶだけ
7. vault_systems に Square Developer のアクセストークンの置き場所をメモ（トークン自体はVercelのenvが正）

⚠ 店頭レジで月会費を打たないでください（カード登録済みの会員は毎月自動課金＝二重請求になります）。
⚠ Webhookは月会費と店頭売上を自動で振り分けます（仕組みは docs/modules/frank/RESERVATION_SYSTEM.md）。

**入会金・休会・プラン変更（#124）**

- **入会金 10,000円（税抜）**: カード登録の初回に、月会費に続けて11,000円（税込）を同じカードへ自動請求。
  **クーポン6種（frankgolft / fujita / anada / ogawa / furukawa / hayashi）** をWeb入会申込で入力すると無料。
  カード請求に失敗した場合はホームに警告が出るので店頭で徴収（レジに「入会金」ボタンあり）
- **休会**: member-os で「休会」にすると月会費の自動課金を一時停止。**休会費2,200円（税込）は店頭で徴収**
  （レジに「休会費（1か月）」ボタンあり）。復帰で自動課金を再開
- **プラン変更**: member-os の会員一覧「プラン変更…」から。差額（税込）÷4×残り週数をその場で登録カードへ
  自動請求し、翌月から新プラン満額。値下げは請求なし（翌月から新価格）
- **⚠退会**: ステータスを退会にしても自動課金は止まりません。画面の案内に従い
  Squareダッシュボードでサブスクリプションを解約してください
- **env追加**: `SQUARE_ACCESS_TOKEN` は **Vercel(member-os) にも**同じ値を設定
  （休会の課金停止・プラン変更のスワップ/差額請求が member-os から Square を叩くため）

### 14-2. （旧）Stripe手順 → 廃止

#123でSquareへ一本化。Stripeはテストモードのみで実課金ゼロのまま終了。
本番有効化・sk_live差替え・Webhook再登録は**不要**です。ダッシュボードは解約せず放置でOK
（過去のテストデータ参照用）。

### 14-3. お客様への確認・リマインダーメール（体験の歩留まり対策）

体験のWeb予約に **確認メール（キャンセルURLの控え）** と **前日リマインダー** を実装済み。
Resendで `frankgolf.jp` を認証すると動き出します（未認証の間は自動スキップ・予約自体は通る）:

1. Resend → Domains → Add Domain → `frankgolf.jp`
2. 表示されるDNSレコードをお名前.com の `frankgolf.jp` に登録 → Verify
   （§12-1と同じ要領。frankgolf.jp はメール運用が無いのでMX追加の心配は不要）
3. Vercel（yozan-genesis）に `RESEND_API_KEY`（demo-salesと同じ値でOK）と
   `FRANK_MAIL_FROM`（例: `FRANK GOLF <info@frankgolf.jp>`）を登録 → Redeploy
4. テスト: 自分のメールで体験予約→確認メールが届く／リマインダーは毎朝6時のcronで前日分が送られます

### 14-4. FRANK公式LINEとスタッフグループ

- **FRANKスタッフグループへOAを追加**（§6の要領・1分）: スタッフ連絡用OAをFRANKのグループへ招待
  → joinイベントでグループIDが自動記録され、店舗別の朝連絡・指示が届くようになります
- **FRANK公式LINE（お客様向け）を開設したら**: `sites/frank-golf/assets/site-data.js` の `links.line` に
  URL（https://lin.ee/…）を入れて push → 全ページのLINEボタンが自動で有効化

### 14-5. そのほか開店前チェック

- **D打席を設営したら**: Supabase で `update frunk_bays set active=true, trial_priority=4 where code='bay-d';`
- **内覧会をやる場合**: Genesis `/site-admin` → 予約設定 → **特別営業日** に日付を入れるだけで
  オープン前でもその日だけ体験・予約を受け付けます（デプロイ不要）
- **サイトの「近日公開」を埋める**: `sites/frank-golf/assets/site-data.js`（住所・電話・入会金・
  ビジター料・持ち物・ラウンジ・特典）。null の項目が画面で「近日公開」になっています
- **特商法・プライバシー・会員規約**（tokushoho/privacy/terms.html）は草案のまま。
  Web決済を本格開始する前に確定と専門家確認を
