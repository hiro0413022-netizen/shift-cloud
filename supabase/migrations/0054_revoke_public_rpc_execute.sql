-- 0054: SECURITY DEFINER 関数を anon / authenticated から実行できないようにする
-- 背景: anonキーは公開されるため、REST(/rest/v1/rpc/...)経由で外部から実行可能だった。
--       特に gn_chat_query(p_sql text, ...) は任意SQLを受け取るため、外部からのデータ読み出しリスクがあった。
-- 方針: 全アプリはサーバー側の service_role から呼ぶ。service_role の EXECUTE のみ残す。
-- 適用済み: 2026-07-15（Supabase本番 qrgpblnnhdudigarrtuz）

revoke execute on function public.gn_chat_query(text, uuid, text, uuid, integer) from anon, authenticated;
revoke execute on function public.refresh_caddy_finance(uuid, date) from anon, authenticated;
revoke execute on function public.refresh_golfwing_membership_forecast(uuid) from anon, authenticated;
revoke execute on function public.refresh_member_kpis(uuid) from anon, authenticated;
revoke execute on function public.refresh_mon_sales_from_lines(uuid, date) from anon, authenticated;
revoke execute on function public.refresh_smart_hello_kpis(uuid) from anon, authenticated;
revoke execute on function public.renumber_caddy_seq(uuid, date) from anon, authenticated;
revoke execute on function public.report_member_counts(uuid, date) from anon, authenticated;
revoke execute on function public.snapshot_member_count(uuid, date) from anon, authenticated;
