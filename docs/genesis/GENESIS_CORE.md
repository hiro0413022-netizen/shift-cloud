# Genesis Core（#289・2026-09-28）— 正典の所在と P0 の使い方

正典（設計）: Claude Docs「Genesis Transformation Proposal」「Genesis Core Final Architecture」。この文書はコード側の入口。

## 何が入口か

- **Tool Registry が中核 Contract**。画面・JARVIS・Workflow・MCP・LINE はすべて `executeTool()` を通る。UI が DB を直接操作する経路は Tool が揃うアプリから順に閉じる。
- 承認が要る decision（auto_undo / approval / two_step）は Core では実行しない。既存 `ai_action_queue`（#61/#186）に積み、承認・取消枠のあと `runQueuedTool()` が `force:true` で実行する。承認UI・取消UI・監査ログは従来のまま。
- 記録は `gn_tool_executions`（正典）。`/dev/architecture` がそれを見る。

## Tool の足し方（4点セットは1ファイルになった）

```ts
export const x = defineTool({ name: "shift.publish", version: 1, domain: "ops", description: "…",
  input: {...JSON Schema...}, output: {...}, permission: ["manage_shifts"], scope: "store", risk: 2,
  idempotency: (i, ctx) => `${ctx.company.id}:${i.from}:${i.to}`, rateLimit: { perMinute: 10 },
  undo: async (out, ctx) => {...}, verify: async (out, ctx) => true, emits: ["shift.updated@1"], renders: "ShiftGrid",
  impl: async (input, ctx) => ({ data: {...}, sources: [{ table: "shifts" }], kind: "fact" }) });
```
`packages/genesis-core/src/tools/*.ts` に置いて `all.ts` の配列へ。emits のイベントは `events.ts` の `BASE_EVENTS` にも足す（無いと登録で落ちる）。

## API

| 口 | 用途 | 認証 |
|---|---|---|
| `GET /api/core/tools` | Tool / Block / Event の一覧 | 画面セッション or Bearer |
| `POST /api/core/tools/<name@version>` `{input, store_id?}` | 実行（承認が要れば queued を返す） | 同上 |
| `GET/POST /api/core/mcp` | MCP tools/list・tools/call（Tool 名は `booking.list__v1`） | Bearer `GENESIS_CORE_SECRET`（無ければ CRON_SECRET）＋ `x-genesis-staff-id`（代理元の人・必須） |

## Rollback

- `GENESIS_CORE_TOOLS=off` で JARVIS の予約・受付は旧ハンドラに戻る（コードは両方残している。P1 で旧を消す）。
- DB は追加のみ。`0208_genesis_core.sql` 末尾の drop で戻る。

## Skill（P3-a・#294）

Skill ＝ Tool を Plan(DAG) で束ねた手順。`packages/genesis-core/src/skills/index.ts` に `defineSkill({ name, steps: (input, ctx) => [...] , summarize })` で書き、`SKILL_TOOLS` に足すだけで Registry に Tool として載る（JARVIS の一覧・MCP・`/api/core/tools/<name>` に自動で出る）。
- Step の Tool 権限・Policy・記録は Step ごと（Skill が権限を束ねない）。承認が要る Step は実行せず waiting_approval。
- 結果は PlanCard ＋ 各 Step の Block。要約に LLM は使わない。

## Proactive ルールの Act（#294）

`gn_rules.action_tool` に Tool、`action_input` に引数（`{count}` `{date}` `{title}` を埋める）。発火時に `api/cron/execute` が `runRuleAct` で Core を通す。AI Actor なので risk>=2 は承認待ち（判断フィードの承認カード）。承認キューの dedupe は `rule:<code>:<日付>:act`。

## 定期処理の台帳（P3-b・#296）

cron は各アプリが持つが、記録は `gn_job_runs` 1つ（`withJobRun(admin, "cron:xxx", null, fn)`）。期待は `JOB_EXPECTATIONS`。新しい cron を足したら (1) withJobRun で包む (2) JOB_EXPECTATIONS に1行 (3) 必要なら 0212 のルール SQL の values に1行。

## Workflow（P3-c・#298）

`packages/genesis-core/src/workflow.ts` の `WORKFLOWS` に `defineWorkflow({ trigger: { type, version, when? }, steps: (event) => [...] })`。cron:execute の processEvents が拾う。Step の Tool は固定版（`waiting.create@1`）で書く。risk>=2 は承認カードになる。

## Memory（P4-a・#299）

`gn_memories` 5スコープ（user / company / store / customer / project）。読むのは `enrichContext`（Tool は `ctx.context.memory` を見る）。書くのは `memory.remember@1`（人=1.0・AI=0.6 推定）。人が `memory.confirm` で確定。JARVIS の system prompt「覚えていること」に入る（推定は明示）。画面は /memories。

## Semantic Search（P4-b・#300）

`gn_embeddings`（768次元・Gemini）。対象は `packages/genesis-core/src/semantic.ts` の `SOURCES`（L3 は入れない）。取り込みは cron:execute の `embed:index`（増分・(created_at,id) カーソル）。検索は Tool `search.semantic@1`。source を足すときは SOURCES に1行（text / title / entity / at）。

## 次（P1）

Command Bar（Ctrl+K）＋ Block Renderer ＋ Person Entity（member-os `/search` の名寄せを core へ）。Tool を使う画面から `@yozan/ui` に揃えていく。
