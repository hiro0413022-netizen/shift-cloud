-- 0169: 全システムチェック（2026-09-13）で見つかった DB 側の穴を塞ぐ
--
-- 1) SECURITY DEFINER 関数が anon / authenticated から REST(/rest/v1/rpc/...) で実行できた
--    anon キーは公開されるため、外部から
--      search_visitors / search_reception_guests / find_guest_by_contact … 受付台帳 6,000 人超の氏名・電話が引ける
--      sync_lesson_outsourcing_expense … 経費（外注費）を書き込める
--      inv_close_count … 棚卸を確定できる
--      trk_record … 閲覧計測に偽のイベントを入れられる
--    という状態だった。0054/0055 と同じ方針: 全アプリはサーバー側 service_role から呼ぶので、
--    public / anon / authenticated から剥奪し service_role にだけ付与し直す。
--    （全呼び出し元を grep 済み。すべて admin(service_role) クライアント経由）
--    ⚠ gn_log_app_event() / sync_frank_member_karte() はトリガー関数（RPC では呼べない）なので対象外。
--
-- 2) search_path が固定されていない関数 12 本（Supabase linter WARN 0011）
--    どれも SECURITY INVOKER の小さな関数だが、呼び出し側の search_path 次第で別の同名関数に
--    すり替えられる余地を無くす。参照先を壊さないよう pg_catalog, public, extensions を明示する。
--
-- 3) 同一定義の索引が 2 本ずつあった（linter duplicate_index）
--      golfwing.receipt_items(receipt_id): idx_gw_ri_receipt / idx_receipt_items_receipt_id
--      public.cad_availability(company_id,date) where deleted_at is null: idx_cad_availability_date / idx_cad_availability_month
--    書き込みのたびに 2 回更新しているだけなので片方を落とす。
--
-- 検証: has_function_privilege('anon'|'authenticated', ..., 'EXECUTE') = false / service_role = true

-- 1) RPC 実行権の剥奪
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and p.proname in (
        'find_guest_by_contact',
        'gw_next_fitting_seq', 'gw_next_quote_seq', 'gw_next_work_order_seq',
        'inv_close_count', 'inv_next_code',
        'personal_lesson_counts', 'personal_lesson_unlinked_lines',
        'search_reception_guests', 'search_visitors',
        'sync_lesson_outsourcing_expense',
        'trk_record'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- 2) search_path の固定
alter function public.gn_ctx_company()            set search_path = pg_catalog, public;
alter function public.gn_ctx_store()              set search_path = pg_catalog, public;
alter function public.gn_ctx_is_hq()              set search_path = pg_catalog, public;
alter function public.gn_store_ok(uuid)           set search_path = pg_catalog, public;
alter function public.gn_dev_requests_touch()     set search_path = pg_catalog, public;
alter function app.digits(text)                   set search_path = pg_catalog, public;
alter function app.kana(text)                     set search_path = pg_catalog, public;
alter function app.gen_secret(integer)            set search_path = pg_catalog, public, extensions; -- gen_random_bytes は pgcrypto(extensions)
alter function app.nite_item_needs_cast(text)     set search_path = pg_catalog, public, app;
alter function app.nite_slip_close_guard()        set search_path = pg_catalog, public, app;
alter function golfwing.norm_name(text)           set search_path = pg_catalog, golfwing, public;
alter function golfwing.norm_maker(text)          set search_path = pg_catalog, golfwing, public;

-- 3) 重複索引
drop index if exists golfwing.idx_gw_ri_receipt;          -- idx_receipt_items_receipt_id を残す（golfwing アプリ側の schema と同名）
drop index if exists public.idx_cad_availability_month;   -- idx_cad_availability_date を残す（0037）
