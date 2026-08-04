# AI営業 引継ぎ書（2026-08-04 時点）

次のセッション／担当者がこれ1枚で続きを始められるようにした状態メモ。
**設計の正典は `DESIGN.md`（3チャネル全体像）、実装の正典は `SYSTEM.md`（Phase 1）。本書は「いまどこまで進んでいて、次に何をするか」だけを書く。**

---

## 1. 現在地（3行）

- **Phase 1（SNSインバウンド＝自分のアカウントで毎日投稿して集める）は実装完了**。DECISIONS #101 / migration 0091・0092 適用済み。
- **未push**（下記 §3 のコマンドをユーザーPCで実行すれば本番反映）。Instagram env は未設定 → 生成・承認は動き、投稿は「予約のまま待機」。
- Phase 2以降（Google Maps発掘 `@yozan/prospect`、メール配信 `@yozan/outreach`、DM半自動）は **未着手**。

## 2. 動く仕組み（1枚）

```
毎朝6時 cron ─→ ホーム判断フィード ─→ 18:00 ─→ Instagram ─→ 集客LP ─→ リード台帳
投稿案を自動生成   承認・AI修正・直接編集   自動投稿   (Graph API)  /lp/* 計測  Sales OS / CEO Inbox
```

- 題材: SWING CORTEX の知識資産（sc_symptoms → sc_checkpoints → sc_knowledge）＋ HP制作ネタ帳8本
- ローテーション: **swing-cortex と webdesign の日替わり交互**
- 監視: **/ai-sales（AI営業 司令室）** — 15秒ポーリングでファネル・投稿パイプライン・活動フィード
- **コールドDMは実装しない**（未接触相手への完全自動DMは合法ルートが存在しない。根拠は DESIGN.md §3-B）

## 3. 残作業（ユーザー作業3つ／これ以外はAI側で完了済み）

| # | 作業 | 状態 | 参照 |
|---|---|---|---|
| U-1 | 型チェック → commit & push（LP・司令室が本番反映） | **未** | 本書 §4 |
| U-2 | @yozan_web_jp の自己紹介にLPリンクを設定 | **✅ 2026-08-04 完了** | — |
| U-3 | 2アカウントのプロアカウント化 ＋ トークン取得 ＋ env登録 | **未** | OPERATIONS §9（9-1〜9-4に詳細手順） |

U-3 が終わると自動投稿が開通する。それまでは承認しても投稿は待機状態のまま（エラーにはならない）。

## 4. U-1 の手順（ユーザーPCのPowerShellにそのまま貼る）

```powershell
cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

# ① 新パッケージ @yozan/content を workspace にリンク（今回だけ必要）
npm install

# ② 型チェック（エラー0ならOK。出たら内容をClaudeに貼る）
cd apps\genesis
npx tsc --noEmit
cd ..\..

# ③ 途中で切れたファイルが無いか検査（0件ならOK）
node scripts/check-files.mjs

# ④ 反映
git status --short
git add -A
git commit -m "feat(genesis): AI営業SNSインバウンド Phase1＋司令室＋HP制作LP (#101, migration 0091/0092)"
git push origin main
```

push後1〜2分でVercelが自動ビルド。確認は https://vercel.com → `yozan-genesis` → Deployments が「Ready」。
反映後に見るもの: **/ai-sales**（司令室）、**/lp/pganote** **/lp/swing-cortex** **/lp/webdesign**（社内から開くときは必ず `?preview=1`）。

## 5. 今回のコミットに含まれるもの（push前の差分）

**新規**

- `packages/content/`（generate / instagram / server / types）
- `apps/genesis/src/lib/content-loop.ts`, `ai-sales-live.ts`
- `apps/genesis/src/app/(main)/ai-sales/`（page / live-board / actions）＝司令室
- `apps/genesis/src/app/lp/`（pganote / swing-cortex / webdesign / lead-form / lp-track）
- `apps/genesis/src/app/api/public/ai-sales/card/[id]`（1080×1080カード画像）, `.../lead`（リード受付）, `api/track`
- `supabase/migrations/0091_ai_sales_content.sql`, `0092_ai_sales_webdesign.sql`（**DBには適用済み**）
- `docs/modules/ai-sales/DESIGN.md` / `SYSTEM.md` / 本書
- `apps/genesis/public/flows/ai-sales.svg`

**変更**: `next.config.ts`（transpilePackages に @yozan/content）/ `package.json` / `middleware.ts`（`/lp` `/api/track` を公開パスに）/ cron 2本（daily・execute）/ `ai-execution.ts`（sns_post ハンドラ）/ `judgment-feed.ts` / `sidebar.tsx` / `network/topology.ts` / DECISIONS / OPERATIONS / NEXT_TASKS

## 6. 次にやること（優先順・DESIGN.mdの実装順）

1. **①@yozan/content の運用ならし** — 1〜2週間まわして、承認率・LP閲覧・リード数を /ai-sales で見る。文面の当たり外れは判断フィードの修正指示で学習（gn_feedback）
2. **②@yozan/prospect** — Google Places APIでHP無し事業者を抽出 → demo-sales でデモ自動生成 → `psp_*`
3. **③@yozan/outreach** — 特電法準拠メール配信（表示義務・オプトアウト）→ `out_*`。メールが取れない先はQR付き提案書の郵送/電話リスト出力
4. **④DM半自動** — AIが選定・デモ・文面まで用意し、送信タップだけ人間。合わせて「投稿にコメント→自動でDMでリンク送付」（これは完全自動が合法）
5. **保守**: IG長期トークンは約60日で失効 → 自動更新は未実装。失効すると /ai-sales に failed と理由が出る

## 7. 引き継ぐ人が踏みやすい地雷

- `/api/track` と `/lp` を middleware の PUBLIC_PREFIXES から外すと、計測とLPが全部 /login へ307（#90と同じ事故）
- 社内からLPを開くときは `?preview=1`（忘れるとファネルのLP閲覧数に社内が混入）
- migration 0091/0092 は**適用済み**。次の migration 番号は **0093**、次の DECISIONS 番号は **#102**
- 並行セッションがあると DECISIONS.md が衝突する。追記時は必ず最新を読んでから
- Instagram env は**アカウント別**。片方だけ設定しても他方は安全に待機する設計（エラーにしない）
