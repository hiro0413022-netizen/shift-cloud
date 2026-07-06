-- DECISIONS #3系: KPI再集計RPCはservice_role専用。anon/authenticatedのEXECUTEを剥奪（Supabase advisor WARN対応）
-- 適用済: 2026-07-06 MCP経由（本番qrgpblnnhdudigarrtuz）
REVOKE EXECUTE ON FUNCTION public.refresh_member_kpis(uuid) FROM PUBLIC, anon, authenticated;
