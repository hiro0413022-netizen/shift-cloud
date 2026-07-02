# Workforce OS — AI_CONTEXT

AIエージェント（将来のGenesis AI / n8nワークフロー）がこのモジュールを操作する際のコンテキスト。

## AIが読めるデータ

シフト・勤怠・希望・人件費集計（スコープ付きAPIキーの権限内）。給与明細個別データは`view_payroll`スコープ必須。

## AIが書けるデータ

- `ai_suggestions`への提案insert（自由）
- その他のミューテーションは**人間の承認済み提案の実行**としてのみ許可（approval_status=approved が前提条件）

## 提案の種別と生成条件（Phase 6実装予定）

| kind | 条件例 |
|------|--------|
| overtime_alert | 週次残業合計がしきい値超過 |
| understaffed / overstaffed | 確定シフト人数が店舗設定の必要人数と乖離 |
| missing_clock | 前日シフトありで打刻ペア不成立 |
| leave_request | 有給等の承認待ちが滞留 |
| expense_pending | 交通費申請待ち滞留 |
| labor_cost | 店舗人件費率がしきい値超過（売上連携後） |

## プロンプト用の要約

「YOZAN Shift Cloudはマルチテナントのシフト・勤怠・給与管理。company>brand>store階層。シフトはテンプレート希望→ドラフト→確定。打刻はiPadキオスク。全操作は監査ログ記録。あなた（AI）は提案を作成でき、実行には人間の承認が必要。」
