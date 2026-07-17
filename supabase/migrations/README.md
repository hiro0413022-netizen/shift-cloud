# supabase/migrations — 適用台帳と採番ルール

## 採番ルール（DECISIONS #38）

- **次に使う番号: `0067` から**（本台帳の最新+1。作成時にこのREADMEも更新すること）
- **関数を作ったら必ず service_role に EXECUTE を付ける**（0065 適用後のルール）:
  `grant execute on function public.<名前>(<引数型>) to service_role;`
  0065 で「新関数への PUBLIC 既定 EXECUTE」を止めたため、書かないと service_role から呼べない。
  逆に anon/authenticated へは付けない（DECISIONS #54/#55: RPCは全てサーバー側 service_role から）
- ✅ `0066_drop_cad_dms_open_read_policies.sql` — 適用済（2026-07-17、MCP name=drop_cad_dms_open_read_policies。cad_*/dms_* の `USING(true)` SELECTポリシー14本を削除＝service_role専用へ #65）
- ✅ `0064_revoke_gnv_views_from_anon.sql` — 適用済（2026-07-17、MCP name=revoke_gnv_views_from_anon。gnv_*16本を anon/authenticated/PUBLIC から剥奪、SELECTは gn_chat_reader のみ #64）
- ✅ `0065_revoke_anon_table_grants.sql` — 適用済（2026-07-17、MCP name=revoke_anon_table_grants。anon のテーブル権限987件を剥奪＋既定付与の停止 #64）。巻き戻しは `rollback_0064_0065.sql`
- ✅ `0059_directive_steps.sql` — 適用済（2026-07-15、MCP name=directive_steps。工程台帳 gn_directive_steps＋gn_directives.target_kind に campaign 追加 #59）
- ✅ `0045_inbox_filter_suggestions_directives.sql` — 適用済（2026-07-14、受信フィルタ・返信承認・改善提案・実行指示 #52）
- ✅ `0046_kpi_labor_align_payroll.sql` — 適用済（2026-07-14、労務KPI一本化 #53系）
- ✅ `0047_report_os_sources.sql` — 適用済（2026-07-14、Report OSデータ源 #53）
- ✅ `0048_demo_sales.sql` — 適用済（2026-07-14、MCP name=demo_sales。AI DEMO SALES dms_*＋シード13件 #54）
- ✅ `0034_mon_receipts.sql` — 適用済（2026-07-11、MCP name=mon_receipts。mon_receipts＋バケットmon-receipts #41）
- ✅ `0035_payroll_allowances.sql` — 適用済（2026-07-11、月給制・手当 #44）
- ✅ `0036_caddy_os.sql` — 適用済（2026-07-11、Caddy OS #45）
- ✅ `0037_caddy_invoice_availability.sql` / `0038_caddy_renumber_seq.sql` — 適用済（2026-07-12、Caddy OSフェーズ2 #46）
- ✅ `0039_staff_portal.sql` — 適用済（2026-07-13、MCP name=staff_portal。sp_tasks/sp_reports/sp_calendar_memos/sp_links #48）
- ✅ `0040_gn_messages.sql` — 適用済（2026-07-13、MCP name=gn_messages。社内連絡ノート /notes）
- ✅ `0041_lesson_os.sql` — 適用済（2026-07-13、MCP name=lesson_os。lsn_*＋バケットlesson-videos #49）
- ✅ `0042_lesson_os_p1.sql` — 適用済（2026-07-13、MCP name=lesson_os_p1。is_best・goal列）
- ✅ `0043_lesson_os_p2.sql` — 適用済（2026-07-13、MCP name=lesson_os_p2。profile/skill・進捗・お手本・共有・描画 #50）
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
- `0044_lesson_os_phases.sql` — Lesson OS: lsn_videos.phases（スイング7フェーズの秒数JSONB）/ duration_sec / source、lsn_model_videosにも同様（#51）
