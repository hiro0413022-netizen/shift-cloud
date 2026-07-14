# Ask Data（データに聞く）— 正典

実データに接地したチャット。Genesis `/chat`（本部）と shift-cloud `/chat`（店舗）で同じエンジンを使う。
決定: DECISIONS #56 / migration `0053_ask_data.sql`

## 1. 何のためにあるか

- 日次レポートは「押し出し」で、聞きたいことを聞けない。
- **店長・スタッフはCoworkを使えない**ため、数字を知るには本部に聞くしかなかった。
- 汎用チャットは作らない。**実データに接地した質問応答だけ**を提供する。

## 2. 一番大事な設計 — LLMは「答え」を書かない

```
質問(日本語) ──Claude──▶ SQL 1本 ──Postgres──▶ 行データ ──Claude──▶ 日本語の答え
                                            └─▶ 画面に生成SQLと件数を表示（出典）
```

- 数字は必ず Postgres が計算する。LLMが数値を創作する経路が存在しない。
- 0件なら「該当するデータはありませんでした」と答える。推測は禁止。
- 答えられない質問には `CANNOT_ANSWER: 理由` を返させる。
- SQLが失敗したら、エラーを見せて**1回だけ**直させる。

## 3. 権限はアプリではなくDBが強制する（多層防御）

| 層 | 何を守るか |
|---|---|
| ① 公開ビュー `gnv_*`（16本） | LLMが触れる唯一の面。実体テーブルは見えない |
| ② ロール `gn_chat_reader` | **実体テーブルへの権限を持たない**。`gn_chat_query()` はこのロール所有の SECURITY DEFINER。文字列ガードを抜けられても実体テーブルに到達できない |
| ③ GUC スコープ | `gn.company_id` / `gn.store_id` / `gn.scope` をビューの WHERE が参照。アプリが渡すSQLの中身に依存しない |
| ④ 文字列ガード | SELECT/WITHのみ・単文のみ・書込/DDL/システム関数を拒否・FROM/JOIN は `gnv_` 以外を拒否・8秒タイムアウト・LIMIT強制 |

検証済み（遮断を確認）: `delete from mon_sales` / `select 1; drop table staff` / `select * from staff` /
`select * from public.payroll_items` / CTE経由の `mbr_members` / `pg_sleep(30)`。

### スコープ

| scope | 使う場所 | 見えるもの |
|---|---|---|
| `hq` | Genesis `/chat`（view_hq）、shift-cloud で view_hq を持つ人 | 全ビュー（給与・経理・銀行・契約・問い合わせ・キャディを含む） |
| `store` | shift-cloud `/chat` | 自店舗の売上・会員・体験・シフト・勤怠・KPIのみ。**給与/経理/銀行/契約/問い合わせ/キャディは0行** |

- **店舗未割当のスタッフは利用不可**（`storeId` が null だと全店が見えてしまうため、アプリ側で明示的に止める）。

## 4. ビュー一覧（gnv_*）

共通: `gnv_sales` `gnv_sales_lines` `gnv_members` `gnv_trials` `gnv_shifts` `gnv_attendance` `gnv_kpi` `gnv_stores` `gnv_staff`
HQのみ: `gnv_finance` `gnv_payroll` `gnv_expenses` `gnv_bank_txn` `gnv_inquiries` `gnv_contracts` `gnv_caddy`

> **ビューを増やしたら `packages/core/src/ask-data.ts` のカタログにも必ず追記する。**
> カタログに書いていない列は、LLMにとって存在しない。

## 5. ファイル

| 役割 | 場所 |
|---|---|
| エンジン（SQL生成→実行→日本語化→ログ） | `packages/core/src/ask-data.ts` |
| DB（ビュー・実行関数・履歴） | `supabase/migrations/0053_ask_data.sql` |
| Genesis 画面 | `apps/genesis/src/app/(main)/chat/` |
| スタッフ画面 | `apps/shift-cloud/src/app/(staff)/chat/` |
| 履歴 | `gn_chat_messages`（質問・生成SQL・回答・件数・実行時間・エラー） |

env: `ANTHROPIC_API_KEY`（必須）、`ASK_DATA_MODEL`（任意・既定 `claude-haiku-4-5-20251001`）

## 6. 既知の限界

- `mon_sales` は月次集計行。2026-06は取込済み（0052の `refresh_mon_sales_from_lines`）。翌月以降は `npm run import:sales -- --month=YYYY-MM --apply` が必要（DECISIONS #57）。
- `mbr_trial_bookings` は0件（体験予約はまだ入っていない）。
- `payroll_items` は0件（給与は都度計算のため、確定分のみが入る）。
- 会員は `mbr_members` のスナップショットで、店舗は `store_name`（テキスト一致）で絞る。
