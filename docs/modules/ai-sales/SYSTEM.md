# AI営業 SNSインバウンド（@yozan/content）— 正典

- DECISIONS: #101（2026-08-04）・**#103（2026-08-05・Xチャネル追加）** / migration: 0091（cnt_posts）・0092（webdesign）・0093（X配信カラム）
- 設計書: `docs/modules/ai-sales/DESIGN.md`（3チャネル全体像。本書はPhase 1=チャネルCの実装正典）
- 監視画面: **/ai-sales（AI営業 司令室）** — リアルタイム（15秒ポーリング）

## 1. 何をするか

PGA NOTE / SWING CORTEX / HP制作 の見込み客を「毎日の価値ある投稿」で集める自動集客ライン。

```
毎朝6時cron ──→ 判断フィード ──→ 18:00 ─┬─→ Instagram（カード画像＋bio誘導）─┐
投稿案を生成      承認・修正        自動投稿 │                                  ├─→ 集客LP ──→ リード台帳
(content-loop)   (ai_action_queue)  (10分cron)└─→ X @YOZAN_inc（本文＋LPリンク）─┘   /lp/* 計測   Sales OS / CEO Inbox
```

**1投稿（cnt_posts 1行）＝ InstagramとXの両方へ配信**。承認カードは1本のまま（判断の回数を増やさない）。

- 題材は **SWING CORTEX知識資産**（sc_symptoms → sc_checkpoints → sc_knowledge）。直近21日のテーマは重複回避
- 商品は日替わり交互（偶数日=PGA NOTE / 奇数日=SWING CORTEX）
- 生成はClaude（`CONTENT_AI_MODEL` > 既定haiku）、キー無し/失敗時はテンプレート（安全側）
- **コールドDMはやらない**（合法ルート無し・DESIGN.md §3-B）。自アカウント投稿＝公式APIで完全自動化が許される領域のみ

## 2. 実装マップ

| 層 | 場所 | 中身 |
|---|---|---|
| パッケージ | `packages/content` | generate（Claude/テンプレ）・instagram（Graph API REST直）・**x（OAuth 1.0a自前署名＋POST /2/tweets）**・server（DB操作） |
| ループ | `apps/genesis/src/lib/content-loop.ts` | runContentLoop（毎朝）・publishDueContent（10分tick）・週次レポート（月曜） |
| 実行 | `lib/ai-execution.ts` の `sns_post` ハンドラ | 承認＝予約確定（cnt_postsへ修正文面を同期）。実投稿は publishDueContent |
| 承認UI | ホーム判断フィード | 実行プラン＋全文＋修正指示（AI/直接編集・gn_feedback学習 0090に相乗り） |
| 画像 | `/api/public/ai-sales/card/[id]` | 1080×1080カードPNG（IGは画像必須）。日本語フォントは実行時サブセット取得 |
| LP | `/lp/pganote` `/lp/swing-cortex` `/lp/webdesign` | 公開LP。閲覧は@yozan/track（token `lp-*`）。**社内リンクは必ず `?preview=1`** |
| リード | `/api/public/ai-sales/lead` | pganote→sales_os(companies/contacts/leads/tasks・福原氏)、swing-cortex/webdesign→sec_inquiries |
| 監視 | `/(main)/ai-sales` | ファネル・投稿パイプライン・活動フィード（15秒ポーリング・「いま作る」ボタン） |

DB: `cnt_posts`（0091・RLS有効ポリシー無し=service_role専用 #65標準形）。リードの専用テーブルは作らない（sales_os / sec_inquiries が台帳）。

## 3. 状態遷移（cnt_posts.status）

`awaiting_approval`（生成直後・判断フィード掲載中）→ 承認 → `scheduled`（時刻待ち）→ `posted` / `failed`。
却下は queue 側 cancelled → 翌朝の掃除（syncRejected）で `rejected` に同期。

**2チャネル配信の状態の決め方（#103・0093）**

| 状況 | status | 記録 |
|---|---|---|
| IG・Xのどちらか1つでも成功 | `posted` | 成功側に `ig_media_id` / `x_tweet_id`、失敗側は `error` / `x_error` に理由 |
| 設定済みチャネルを試して全滅 | `failed` | 両方の理由を各列に |
| どのチャネルも未設定 | `scheduled` のまま | 各列に「未設定」注記のみ（**設定した瞬間、次の10分tickで自動投稿**） |

チャネルの成否は独立。片方だけ接続済みでも安全に動く（未接続側はエラーにしない）。

## 4. 商品・アカウント・env

**Instagram（商品ごとにアカウントを分ける・2026-08-04）**

| 商品(product) | 投稿先アカウント | 題材 | env |
|---|---|---|---|
| swing-cortex | @swingcortex_jp | SWING CORTEX資産（sc_*） | `IG_ACCESS_TOKEN` / `IG_BUSINESS_ID` |
| pganote | @swingcortex_jp（既定ローテ外・config.productsに追加で有効化） | 同上 | 同上 |
| webdesign | @yozan_web_jp | `WEB_TOPICS`（packages/content/generate.ts の題材リスト・8本） | `IG_ACCESS_TOKEN_WEB` / `IG_BUSINESS_ID_WEB` |

**X（全商品を会社公式1アカウントに集約・2026-08-05 #103）**

| 投稿先 | env | 費用 |
|---|---|---|
| @YOZAN_inc（株式会社YOZAN公式・全事業） | `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | 従量課金: 投稿$0.015・**リンク付き$0.20**/件。月30本で約$6 |

なぜXだけ1アカウントか: Xは**本文にリンクを直接置ける**ため、商品ごとにアカウントを分けなくても投稿単位でLPへ飛ばせる。
Instagramは本文リンクが踏めずbio誘導になるので、商品ごとにアカウントを分ける必要がある。

**投稿本文の作り分け**（同じ生成結果から2チャネル分を組み立てる）

- IG … `buildCaption()`＝本文＋ハッシュタグ全部。画像は `/api/public/ai-sales/card/[id]`
- X … `buildTweetText()`＝本文を**280重み**に自動短縮＋`/lp/*?src=x`＋ハッシュタグ2つまで
  - Xは**全角を2文字として数える**＝日本語は実質140字。IGの400字本文をそのまま送ると必ず落ちるので短縮は必須
  - URLはt.co短縮で一律23文字扱い（URLの実長は無関係）

共通env: `ANTHROPIC_API_KEY`（無しはテンプレ生成）・`CONTENT_AI_MODEL`（任意・既定haiku）。
既定ローテーションは gn_loops(sns_content).config.products = `["swing-cortex","webdesign"]`（日替わり交互）。
アカウントはvault_systems参照（PWはユーザー本人のみ保持）。接続手順は `docs/genesis/OPERATIONS.md` §9（Instagram）・§10（X）。

## 5. 壊しやすい点

- `/api/track` と `/lp` は middleware の PUBLIC_PREFIXES 登録済み（外すと計測とLPが全部 /login へ307＝#90の事故）
- 社内からLPを開くときは `?preview=1`。忘れると社内閲覧がファネルのLP閲覧数に混入する（@yozan/trackの鉄則）
- LPの trk_links は登録時に notified_at を即埋めて**ホットリード通知の対象外**にしている（匿名公開ページのため）。demo-sales側のホットリードとは扱いが違う
- sales_os はスキーマ分離。`admin.schema("sales_os")` で読む。UUID直書きせず code='PN'・名前で解決（Sales OS側の並び替えに耐える）
- カード画像はMetaが取得しに来るため公開必須（/api/public配下から動かさない）
- ループの既定ONは株式会社YOZANのみ（gn_loops sns_content・他テナントは既定OFF）
- **Xのキーを再生成したらenvも必ず差し替える**（コンソールは末尾数文字しか再表示しない）。ズレると 401 になり、理由は /ai-sales の投稿カードに出る
- **Xのアプリ権限を「読み取りのみ」に戻すと 403**。権限変更後は**アクセストークンの再生成が必須**（古いトークンは古い権限のまま）
- Xは残高切れでも 403。クレジット残高は console.x.com →「クレジット」で確認
- テスト: `tests/x-post.test.ts`（OAuth 1.0a署名を公式ドキュメントの既知ベース文字列と突き合わせ／280重みの上限）

## 6. 残タスク（Phase 1の続き）

1. ユーザー: IGビジネスアカウント接続＋env設定（OPERATIONS §9）→ Instagram側が開通（Xは接続済み）
2. Instagram Insights / X metrics（`metrics` 列の入れ物は用意済み）の取得cron
3. コメント起点の自動DM（「診断」コメント→リンク自動返信。合法・Graph APIのcomment webhook）
4. Phase 2: @yozan/prospect（Google Maps発見）／Phase 3: @yozan/outreach（メール）／Phase 4: DM半自動（DESIGN.md）
