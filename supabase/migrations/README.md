# supabase/migrations — 適用台帳と採番ルール

## 採番ルール（DECISIONS #38）

- **次に使う番号: `0040` から**（本台帳の最新+1。作成時にこのREADMEも更新すること）
- ✅ `0034_mon_receipts.sql` — 適用済（2026-07-11、MCP name=mon_receipts。mon_receipts＋バケットmon-receipts #41）
- ✅ `0035_payroll_allowances.sql` — 適用済（2026-07-11、月給制・手当 #44）
- ✅ `0036_caddy_os.sql` — 適用済（2026-07-11、Caddy OS #45）
- ✅ `0037_caddy_invoice_availability.sql` / `0038_caddy_renumber_seq.sql` — 適用済（2026-07-12、Caddy OSフェーズ2 #46）
- ✅ `0039_staff_portal.sql` — 適用済（2026-07-13、MCP name=staff_portal。sp_tasks/sp_reports/sp_calendar_memos/sp_links #48）
- 追加のみ。既存テーブルの破壊的変更禁止（DROP/型変更/NOT NULL化は要承認）
- 適用は Supabase MCP `apply_migration`（本番 qrgpblnnhdudigarrtuz）。適用したら本台帳に✅を記す
- **過去の番号重複（6ペア）はリネームしない**: 全て適用済みで、リネームは適用履歴と乖離するため凍結（AUDIT_2026-07-11）

## 番号重複の対応表（凍結）

| 番号 | ファイル | 内容 |
|------|---------|------|
| 0020 | 0020_golfwing_company_id_default.sql / 0020_reservations.sql | 別物・両方適用済 |
| 0022 | 0022_golfwing_suppliers_missing_columns.sql / 0022_money_os.sql | 別物・両方適用済 |
| 0023 | 0023_member_portal_and_board.sql / 0023_money_store_scope.sql | 別物・両方適用済 |
| 0024 | 0024_legal_os.sql / 0024_reservation_payments.sql | 別物・両方適用済 |
| 0027 | 0027_kpi_latest_month.sql / 0027_walkin_followup.sql | 別物・両方適用済 |
| 0031 | 0031_reserve_os.sql / 0031_survey_golfwing_seed.sql | 別物・両方適用済 |

## 金額ロジックを含むmigration（変更時は tests/ の回帰テスト対象）

- `0028_golfwing_membership_forecast.sql` — 月会費予測の単価表・課金ルール（tests/membership-forecast-sql.test.ts が固定）
- `0008_kpi_real_data.sql` / `0029_finance_kpis_completed_month.sql` — KPI集計
