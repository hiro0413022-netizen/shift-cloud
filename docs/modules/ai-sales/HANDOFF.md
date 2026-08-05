# AI営業 引継ぎ書（2026-08-04 時点）

次のセッション／担当者がこれ1枚で続きを始められるようにした状態メモ。
**設計の正典は `DESIGN.md`（3チャネル全体像）、実装の正典は `SYSTEM.md`（Phase 1）。本書は「いまどこまで進んでいて、次に何をするか」だけを書く。**

---

## 1. 現在地（3行）

- **Phase 1（SNSインバウンド＝自分のアカウントで毎日投稿して集める）は実装完了**。DECISIONS #101・**#103（Xチャネル追加）** / migration 0091・0092・0093 適用済み。
- **未push**（下記 §4 のコマンドをユーザーPCで実行すれば本番反映）。**X @YOZAN_inc は接続済み**（env 4つ登録済み）、**Instagram は未接続**（Meta開発者登録のSMS制限待ち）。片方だけでも安全に動く設計。
- Phase 2以降（Google Maps発掘 `@yozan/prospect`、メール配信 `@yozan/outreach`、DM半自動）は **未着手**。

## 2. 動く仕組み（1枚）

```
毎朝6時 cron ─→ ホーム判断フィード ─→ 18:00 ─┬─→ Instagram（カード画像＋bio誘導）─┐
投稿案を自動生成   承認・AI修正・直接編集   自動投稿 │                                ├─→ 集客LP ─→ リード台帳
                                              └─→ X @YOZAN_inc（本文＋LPリンク）─┘  /lp/* 計測  Sales OS / CEO Inbox
```

**1投稿＝IGとXの両方へ配信**（承認は1回のまま）。Xは全角2文字カウントのため本文を280重みに自動短縮する。

- 題材: SWING CORTEX の知識資産（sc_symptoms → sc_checkpoints → sc_knowledge）＋ HP制作ネタ帳8本
- ローテーション: **swing-cortex と webdesign の日替わり交互**
- 監視: **/ai-sales（AI営業 司令室）** — 15秒ポーリングでファネル・投稿パイプライン・活動フィード
- **コールドDMは実装しない**（未接触相手への完全自動DMは合法ルートが存在しない。根拠は DESIGN.md §3-B）

## 3. 残作業（ユーザー作業3つ／これ以外はAI側で完了済み）

| # | 作業 | 状態 | 参照 |
|---|---|---|---|
| U-1 | 型チェック → commit & push（LP・司令室が本番反映） | **未** | 本書 §4 |
| U-2 | @yozan_web_jp の自己紹介にLPリンクを設定 | **✅ 2026-08-04 完了** | — |
| U-3 | Instagram 2アカウントのプロアカウント化 ＋ トークン取得 ＋ env登録 | **9-1完了 / 9-2で停止中** | OPERATIONS §9（9-1〜9-4に詳細手順） |
| U-4 | X `@YOZAN_inc` の作成・開発者登録・キー4つのenv登録 | **✅ 2026-08-05 完了** | OPERATIONS §10 |
| U-5 | Xプロフィールのウェブサイト欄にLPを設定 | **未**（任意・本文リンクが効くので優先度低） | — |

> **U-3の現状（2026-08-05）**: 9-1（プロアカウント化＋Facebookページ接続）は完了。9-2でMeta for Developersの開発者アカウント登録が必要と判明し、**SMS認証コードの再送上限に達して停止中**（080-9456-3420宛）。制限は数時間〜24時間で解除されるので、解除後に https://developers.facebook.com/ → 右上「開始する」から登録を再開（Verify account → Contact info → About youで役割「開発者」）。**アカウント登録はユーザー作業**（AIはアカウント作成不可）。登録完了後の 9-2後半（アプリ作成＋Instagram製品追加）と 9-3（トークン・ID取得）はAIが実行できる。
> 詰まった場合の代替: 「携帯電話番号を変更」で別番号を使う。

**U-1（push）が終われば、Xへの自動投稿はその日から動く**（キーは登録済み）。U-3が終わるとInstagramも並行して流れる。未接続チャネルは注記のみで待機し、エラーにはならない。

## 4. U-1 の手順（ユーザーPCのPowerShellにそのまま貼る）

```powershell
cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

# ① 新パッケージ @yozan/content を workspace にリンク（今回だけ必要）
npm install

# ② 型チェック（エラー0ならOK。出たら内容をClaudeに貼る）
cd apps\genesis
npx tsc --noEmit
cd ..\..

# ③ テスト（116件パスすればOK。Xの署名・文字数もここで検証される）
npm test

# ④ 途中で切れたファイルが無いか検査（0件ならOK）
node scripts/check-files.mjs

# ⑤ 反映
git status --short
git add -A
git commit -m "feat(genesis): AI営業SNSインバウンド Phase1＋司令室＋HP制作LP＋Xチャネル (#101/#103, migration 0091-0093)"
git push origin main
```

push後1〜2分でVercelが自動ビルド。確認は https://vercel.com → `yozan-genesis` → Deployments が「Ready」。
反映後に見るもの: **/ai-sales**（司令室）、**/lp/pganote** **/lp/swing-cortex** **/lp/webdesign**（社内から開くときは必ず `?preview=1`）。

## 5. 今回のコミットに含まれるもの（push前の差分）

**新規**

- `packages/content/`（generate / instagram / **x** / server / types）
- `tests/x-post.test.ts`（OAuth 1.0a署名・280重みの検証 8件）
- `apps/genesis/src/lib/content-loop.ts`, `ai-sales-live.ts`
- `apps/genesis/src/app/(main)/ai-sales/`（page / live-board / actions）＝司令室
- `apps/genesis/src/app/lp/`（pganote / swing-cortex / webdesign / lead-form / lp-track）
- `apps/genesis/src/app/api/public/ai-sales/card/[id]`（1080×1080カード画像）, `.../lead`（リード受付）, `api/track`
- `supabase/migrations/0091_ai_sales_content.sql`, `0092_ai_sales_webdesign.sql`, `0093_ai_sales_x_channel.sql`（**DBには適用済み**）
- `docs/modules/ai-sales/DESIGN.md` / `SYSTEM.md` / 本書
- `apps/genesis/public/flows/ai-sales.svg`

**変更**: `next.config.ts`（transpilePackages に @yozan/content）/ `package.json` / `middleware.ts`（`/lp` `/api/track` を公開パスに）/ cron 2本（daily・execute）/ `ai-execution.ts`（sns_post ハンドラ）/ `judgment-feed.ts` / `sidebar.tsx` / `network/topology.ts` / DECISIONS / OPERATIONS / NEXT_TASKS

## 6. 次にやること（優先順・DESIGN.mdの実装順）

1. **①@yozan/content の運用ならし** — 1〜2週間まわして、承認率・LP閲覧・リード数を /ai-sales で見る。文面の当たり外れは判断フィードの修正指示で学習（gn_feedback）
2. **②@yozan/prospect** — Google Places APIでHP無し事業者を抽出 → demo-sales でデモ自動生成 → `psp_*`
3. **③@yozan/outreach** — 特電法準拠メール配信（表示義務・オプトアウト）→ `out_*`。メールが取れない先はQR付き提案書の郵送/電話リスト出力
4. **④DM半自動** — AIが選定・デモ・文面まで用意し、送信タップだけ人間。合わせて「投稿にコメント→自動でDMでリンク送付」（これは完全自動が合法）
5. **保守**: IG長期トークンは約60日で失効 → 自動更新は未実装。失効すると /ai-sales に failed と理由が出る。Xのキーは失効しないが、再生成したらenv差し替えが必須

## 7. 引き継ぐ人が踏みやすい地雷

- `/api/track` と `/lp` を middleware の PUBLIC_PREFIXES から外すと、計測とLPが全部 /login へ307（#90と同じ事故）
- 社内からLPを開くときは `?preview=1`（忘れるとファネルのLP閲覧数に社内が混入）
- migration 0091/0092/0093 は**適用済み**。次の migration 番号は **0094**、次の DECISIONS 番号は **#104**
- 並行セッションがあると DECISIONS.md が衝突する。追記時は必ず最新を読んでから
- env は**チャネル別・アカウント別**。片方だけ設定しても他方は安全に待機する設計（エラーにしない）
- **Xは全角を2文字として数える**（280重み＝日本語140字）。IG用の本文をそのまま送ると必ず落ちるので `buildTweetText()` を通す
- **Xのアプリ権限を変えたらアクセストークンを再生成**（古いトークンは古い権限のまま＝403）
