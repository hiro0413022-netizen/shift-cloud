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

## 原則（リスク階層モデル / DECISIONS #61 2026-07-16）

**「保存するだけ・全部承認待ち」は廃止。** 危険なものだけ承認に上げ、それ以外は自動実行する（VISION §7/§8）。承認者（＝古川さん）の机に届く件数を最小化するのが完全自動化の要。

1. AIの実行は `action_type` ごとに3階層で決まる（正典＝DBの `ai_execution_policies`。テーブルで編集可）:

   | モード | 意味 | 例（`action_type`） |
   |--------|------|------|
   | **auto**（緑） | 承認不要で即実行。監査ログのみ | data_analysis / report_generate / kpi_refresh / draft_create / internal_notify / deliverable_generate / issue_create / pr_open / test_run / order_candidate |
   | **auto_undo**（黄） | 自動実行するが `undo_deadline` まで取消可 | staff_directive(15分) / line_broadcast(15分) / sns_post(30分) |
   | **approval**（赤） | 古川さんの承認が必須（不可逆・高額・対外重要・個人情報・法務） | prod_deploy / db_change / payment / large_payment / customer_message / personal_info / contract / hiring / price_change / policy_change |

2. どのモードでも**実行は必ず監査ログ（audit_logs, actor_type='ai'）に残す**。auto/auto_undoは事後確認可能に、approvalは承認記録も残す。
3. 新しい `action_type` の既定は **approval**（`ai_suggestions.execution_mode` の既定も approval）。安全側から始め、実績を見て `ai_execution_policies` で auto に緩める。
4. AIエージェントは専用ロール（スコープ付きAPIキー）で操作し、人間と同じ権限チェック（RLS）を受ける。
5. 給与・個人情報に関わる提案・実行は本部/オーナーのみ閲覧可。personal_info系は常に approval。
6. 提案・実行の生成元（source: rule/ai_agent）と実行モードを必ず記録し、精度と自律度を後から評価できるようにする。

> ⚠️ このポリシーが実際に自動実行を起こすのは、executor（cron/n8n/サーバアクション）が `ai_suggestions.execution_mode` と `ai_execution_policies` を読んで分岐するよう配線してから。配線タスクは NEXT_TASKS 参照。migration 0061 適用時点ではスキーマの土台のみ（既定=approval で現行動作は不変）。

## 将来の提案生成（Phase 6以降）

- ルールベース（SQL集計 + n8n cron）から開始 → LLM分析は後段
- 例: 週次で残業時間集計 → しきい値超過で`overtime_alert`をinsert（`execution_mode`はポリシーで解決）
