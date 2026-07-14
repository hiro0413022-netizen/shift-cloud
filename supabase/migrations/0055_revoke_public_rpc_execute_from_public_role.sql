-- 0055: 0054の続き。
-- Postgresは関数作成時に PUBLIC ロールへ EXECUTE を既定付与するため、
-- anon/authenticated から revoke しても PUBLIC 経由で実行できてしまっていた。
-- PUBLIC からも剥奪し、service_role にだけ付与し直す。
-- 適用済み: 2026-07-15（Supabase本番 qrgpblnnhdudigarrtuz）
-- 検証: has_function_privilege('anon'|'authenticated', ..., 'EXECUTE') = false / service_role = true

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname in ('gn_chat_query','refresh_caddy_finance','refresh_golfwing_membership_forecast',
                        'refresh_member_kpis','refresh_mon_sales_from_lines','refresh_smart_hello_kpis',
                        'renumber_caddy_seq','report_member_counts','snapshot_member_count')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
