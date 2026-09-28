# packages/

YOZAN GENESIS 共通パッケージ（DECISIONS #35 — #10の「packages化」を11アプリ目で履行）。

## 方針

- **新規アプリは `@yozan/core` を使う**（`npm run new-app` の雛形が最初から使用）
- **既存11アプリは当面コピーのまま**。各アプリの `src/lib/auth.ts` 等は微妙に分岐済みで、一括移行は回帰リスクが高い（AUDIT_2026-07-11 §3）。移行は1アプリずつ・Vercelビルド確認付きで実施（バックログB-6）
- `ui` / `config` の集約は既存アプリのデザイン分岐が大きいため後続。テンプレートは自前の最小UI（`src/components/ui.tsx`）を持つ

## packages/core

| モジュール | 内容 |
|---|---|
| `@yozan/core/auth` | `createActorResolver({ anyOf })` — staff+roles解決・権限チェック（#18） |
| `@yozan/core/jst` | `jstDateJa` / `jstYmd` / `jstMonthStart`（#73・genesis/inventory-osのコピーを#115でcoreへ集約。既存コピーは当面残置） |
| `@yozan/core/kernel` | `logEvent` / `logAudit`（company_events / audit_logs #16） |
| `@yozan/core/middleware` | `createAuthMiddleware({ publicPrefixes })` |
| `@yozan/core/supabase/admin` | service_roleクライアント（#11） |
| `@yozan/core/supabase/server` | RLSクライアント（@supabase/ssr） |

TSソースのまま提供するため、利用側の `next.config.ts` に `transpilePackages: ["@yozan/core"]` が必要（テンプレートは設定済み）。

## packages/track

配布したトークン付きURLの**閲覧計測**（migration 0085・#95）。正典 `docs/modules/track/SYSTEM.md`。

| モジュール | 内容 |
|---|---|
| `@yozan/track/server` | `registerLink` / `recordView` / `getLinkByResource` / `listSessions` / `getHotLinks` / `markNotified` / `formatDuration` |
| `@yozan/track/beacon` | `injectTracking(html, opts)` — 配信HTMLに計測スクリプトを差し込む（保存済みHTMLは書き換えない） |
| `@yozan/track/route` | `createTrackHandler(getAdmin)` — 受信POSTルート。⚠ middlewareの公開パスに `/api/track` を追加すること（#90） |
| `@yozan/track/types` | 型定義 |

`app` / `resource_type` / `resource_id` で任意のシステムから使える。
第一号は demo-sales の営業デモだが、予約リンク・アンケート・月次資料も同じ形で乗る。
Supabaseクライアントは**引数で受け取る**（アプリ非依存）ので、利用側は `createAdmin()` を渡すだけ。

## packages/import（#115・MODULARIZATION_PLAN ①）

CSV取込/出力の共通コア。**依存なし・Node/Edge両対応**。切り出し元は Money OS の `bankCsv.ts`（実運用実績あり）。
Excel(.xlsx)は対象外（ExcelJS依存とSmart Hello名前空間ハックがあるため member-os 側に残置）。

| モジュール | 内容 |
|---|---|
| `@yozan/import/csv` | `parseCsv`（引用符内カンマ/改行対応） / `toCsv`（既定BOM付き=Excel文字化け対策） / `csvEscape` |
| `@yozan/import/decode` | `decodeText` / `decoderLabel`（cp932/MS932→shift_jis吸収） |
| `@yozan/import/normalize` | `toNumber`（全角/カンマ） / `parseDate`（YYYY/MM/DD・2025年9月1日） / `makeDedupKey` |
| `@yozan/import/table` | `tableToRecords`（前置き行スキップ） / `headerIndex` |

列マッピング（どの列を何に使うか）はアプリ側に残す。10アプリの既存コピーは当面そのまま（B-6方針）。

## packages/billing（#115・MODULARIZATION_PLAN ②）

Stripe継続課金の共通コア。**SDKなし・fetchでREST直**（frank-billing #97 と同方式）。DB更新はアプリ側（track方式）。

| モジュール | 内容 |
|---|---|
| `@yozan/billing/stripe` | `stripePost` / `createStripeCustomer` / `createSubscriptionCheckout`（`buildSubscriptionCheckoutParams`は純粋関数でテスト済） / `verifyStripeSignature` / `stripeSecretKey` |
| `@yozan/billing/webhook` | `createStripeWebhookHandler({ onEvent })` — 署名検証→onEvent、失敗はStripeに再送させる。⚠ /api/public 配下推奨（#90） |

FRANKの sk_live 差替え時にこの経路へ移行するのが次の使いどころ。

## packages/cron（#115・MODULARIZATION_PLAN ④）

Vercel Cronルートの共通形（genesis daily / demo-sales prospect の同型2箇所目＝切り出しルール発動）。

| モジュール | 内容 |
|---|---|
| `@yozan/cron/server` | `requireCronAuth`（Bearer ${CRON_SECRET}） / `createCronHandler({ listCompanies, run })` — 1社の失敗で他社を巻き込まない |

⚠ ルート側で `maxDuration` 宣言と middleware 公開プレフィックス登録は引き続き必須（このパッケージでは肩代わりできない）。

## packages/genesis-core（#289・Transformation P0）

Genesis Core。**Tool Registry が中核 Contract**（UI / Agent / Skill / Workflow / MCP / LINE / Voice はすべてここを通る）。Next・zod に依存しない（`node --test` でそのまま走る・MCP へそのまま出せる）。正典は Claude Docs「Genesis Core Final Architecture」と `docs/genesis/GENESIS_CORE.md`。

| モジュール | 内容 |
|---|---|
| `@yozan/genesis-core/schema` | JSON Schema サブセットの検証（Tool input/output・Event payload・Block data） |
| `@yozan/genesis-core/tool` | `defineTool()` / Tool Contract（name@version・permission・scope・risk・undo・verify・emits・renders・rateLimit・idempotency） |
| `@yozan/genesis-core/registry` | `ToolRegistry`（版の並存・resolve・MCP manifest） |
| `@yozan/genesis-core/policy` | Policy Engine（Tool×Role×Store×Amount×Context×Risk → allow / auto_undo / approval / two_step / deny） |
| `@yozan/genesis-core/context` | Genesis Context Protocol（`baseContext` / `enrichContext` / `effectiveActor`） |
| `@yozan/genesis-core/plan` | Plan（DAG）の型・`validatePlan`・`readySteps`・`bindInput` |
| `@yozan/genesis-core/events` | Event Catalog（type@version）・`emitEvent` → gn_events |
| `@yozan/genesis-core/blocks` | Block Registry（初期15種・`register()` で追加） |
| `@yozan/genesis-core/llm` | `llmCall({task, privacy})` Model Router（haiku / sonnet / local）＋ gn_llm_calls |
| `@yozan/genesis-core/execute` | `executeTool()` Action Engine（policy→rateLimit→idempotency→impl→output検証→verify→silent zero→記録）・`undoExecution()` |
| `@yozan/genesis-core/metrics` | Developer Dashboard の集計 |
| `@yozan/genesis-core/tools/*` | P0 の Tool（ops / customer / finance / growth / dev）と `createGenesisCore()` |

apps 側の組み立ては `apps/genesis/src/core/`（registry / actor / run / api-auth）。Tool を足すときは `defineTool` を書いて `createGenesisCore({ tools })` に渡すだけ（risk>=2 は undo/verify が無いと登録で落ちる）。
