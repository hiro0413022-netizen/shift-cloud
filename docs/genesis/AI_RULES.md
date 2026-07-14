# AI RULES

## AI提案（ai_suggestions）構造

| カラム | 内容 |
|--------|------|
| kind | 種別: `overtime_alert` / `understaffed` / `overstaffed` / `leave_request` / `missing_clock` / `expense_pending` / `labor_cost` / `custom` |
| severity | `info` / `warning` / `critical` |
| store_id / staff_id | 対象（null可） |
| title / body | 内容 |
| suggested_action | 推奨アクション（構造化JSON: `{type, params}`） |
| approval_status | `pending` / `approved` / `rejected` |
| execution_status | `not_executed` / `executed` / `failed` |
| source | `rule` / `ai_agent` / `manual` |
| created_at / decided_by / decided_at / executed_at | 履歴 |

## 原則

1. MVPではAIは提案を**保存するだけ**。自動実行しない
2. 実行は必ず人間の承認後。承認・実行は監査ログに残る
3. AIエージェントは専用ロール（スコープ付きAPIキー）で操作し、人間と同じ権限チェックを受ける
4. 給与・個人情報に関わる提案は本部/オーナーのみ閲覧可
5. 提案の生成元（rule/ai_agent）を必ず記録し、精度を後から評価できるようにする

## 将来の提案生成（Phase 6以降）

- ルールベース（SQL集計 + n8n cron）から開始 → LLM分析は後段
- 例: 週次で残業時間集計 → しきい値超過で`overtime_alert`をinsert
