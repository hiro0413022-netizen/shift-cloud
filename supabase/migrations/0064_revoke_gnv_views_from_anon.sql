-- 0064: gnv_* ビューを anon / authenticated / PUBLIC から剥奪する（Ask Data の読み取り面を gn_chat_reader だけに絞る）
--
-- 背景（監査 2026-07-17）:
--   gnv_* は全て SECURITY DEFINER ビュー（オーナー postgres）で、実体テーブルの RLS を迂回する。
--   防御は WHERE 句の gn_ctx_company() / gn_ctx_is_hq() のみで、その正体は
--   セッション変数 current_setting('gn.company_id') — つまり「呼び出し側が自分で名乗る」値。
--   にもかかわらず anon / authenticated に ALL 権限が付いていた（Supabase の public スキーマ既定 ACL 由来）。
--
--   実証（監査時、anon ロールで gn.company_id を偽装）:
--     gnv_members=243行 / gnv_bank_txn=698行 / gnv_staff=10行 が読めた。
--
--   現時点では未到達: PostgREST は request.* 以外の GUC を設定できず、set_config を叩く
--   RPC も存在しない（gn_chat_query は 0054/0055 で anon/authenticated から剥奪済み）。
--   ただし「set_config を呼ぶ関数を1本 anon に生やす」だけで会員・財務・給与が全開になる。
--   潜在穴を残さないため、そもそもビューに触れないようにする。
--
-- 方針:
--   - gnv_* を読むのは Ask Data の gn_chat_reader 接続だけ（DECISIONS #56）。よって SELECT は gn_chat_reader のみ。
--   - service_role の権限は温存（サーバー側コードからの参照余地を壊さない）。
--   - security_invoker=true には *しない*。gn_chat_reader は実体テーブルへの GRANT を持たないため、
--     invoker 化すると Ask Data が全滅する。「RLS迂回はビュー、テナント境界は gn_chat_query の引数、
--     アクセス制御は GRANT」という三層構成を維持する。
--
-- 適用済み: 2026-07-17（Supabase本番 qrgpblnnhdudigarrtuz、MCP name=revoke_gnv_views_from_anon）
-- 検証済み:
--   - gnv_* 16本すべて anon/authenticated の SELECT = false、gn_chat_reader = true、service_role = true
--   - 監査時に成立した攻撃（anon + gn.company_id 偽装）を再実行 → `permission denied for view gnv_members` で遮断
--   - Ask Data 疎通OK: gn_chat_query('select store_name, count(*) ... from gnv_members', scope='hq') が正常応答

do $$
declare v record;
begin
  for v in
    select c.oid::regclass as rel
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'v'
      and c.relname like 'gnv\_%'
    order by 1
  loop
    execute format('revoke all on %s from public, anon, authenticated', v.rel);
    execute format('grant select on %s to gn_chat_reader', v.rel);
  end loop;
end $$;

-- 確認（適用後に手で実行）:
--
--   select c.relname,
--          has_table_privilege('anon',           c.oid, 'SELECT') as anon_select,
--          has_table_privilege('authenticated',  c.oid, 'SELECT') as auth_select,
--          has_table_privilege('gn_chat_reader', c.oid, 'SELECT') as reader_select
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname='public' and c.relkind='v' and c.relname like 'gnv\_%'
--   order by 1;
--
--   期待: anon_select=false / auth_select=false / reader_select=true が16行
