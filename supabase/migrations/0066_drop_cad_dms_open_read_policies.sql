-- 0066: cad_* / dms_* の「全員読める」SELECTポリシー14本を削除する
--
-- 背景（監査 2026-07-17、DECISIONS #64 の残件1）:
--   cad_availability / cad_clients / cad_dispatches / cad_invoices / cad_partners /
--   dms_activities / dms_demos / dms_documents / dms_options / dms_plans /
--   dms_projects / dms_prospects / dms_quote_settings / dms_quotes
--   の14テーブルに `<table>_read: FOR SELECT TO authenticated USING (true)` が付いていた。
--   = ログインさえすれば **会社もロールも無視して全件読める**。
--   キャディ派遣の取引先・請求、営業先リスト・見積・活動履歴が該当。
--   現状 auth ユーザー10名・1社なので実害は出ていないが、テナント/権限モデルが壊れている。
--
-- なぜ「company_id = app.current_company_id() に書き換える」ではなく「削除」か:
--   cad_*/dms_* への到達経路を全ファイル走査した結果、**アクセスは 100% service_role（createAdmin）経由**で、
--   RLSが効く createClient() からの .from('cad_*'/'dms_*') は **0件**（caddy-os 6ファイル / demo-sales 8ファイル）。
--   つまりこのポリシーは一度も使われていない。テナント条件に書き換えても「誰も通らない経路」が残るだけで、
--   意図を偽って表明するポリシーはむしろ誤読のもと。
--   RLS有効＋ポリシー0 = anon/authenticated は全拒否、service_role のみ（BYPASSRLS）。
--   これは gn_directives / vault_systems / ai_action_queue など既存13テーブルと同じ本リポジトリの標準形。
--   認可はアプリ層（use_caddy / use_demo_sales | view_hq、DECISIONS #3）で行う。
--
--   将来 authenticated から直接読む画面を作る場合は、その時に
--     create policy <table>_tenant_read on public.<table>
--       for select to authenticated using (company_id = app.current_company_id());
--   を足す（company_id列は14テーブルすべてに存在済み）。
--
-- 適用済み: 2026-07-17（Supabase本番 qrgpblnnhdudigarrtuz、MCP name=drop_cad_dms_open_read_policies）
-- 検証済み: pg_policies の cad_*/dms_* が 14件 → 0件。caddy-os / demo-sales は service_role 経由のため無影響。
-- 巻き戻し: 本ファイル末尾のコメント参照

do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (tablename like 'cad\_%' or tablename like 'dms\_%')
      and cmd = 'SELECT'
      and qual = 'true'
    order by 1
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 確認（適用後に手で実行）:
--   select count(*) from pg_policies
--   where schemaname='public' and (tablename like 'cad\_%' or tablename like 'dms\_%');
--   -- 期待: 0
--
-- 巻き戻し（監査前の状態に戻す。非推奨）:
--   do $$
--   declare t text;
--   begin
--     foreach t in array array['cad_availability','cad_clients','cad_dispatches','cad_invoices','cad_partners',
--                              'dms_activities','dms_demos','dms_documents','dms_options','dms_plans',
--                              'dms_projects','dms_prospects','dms_quote_settings','dms_quotes']
--     loop
--       execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
--     end loop;
--   end $$;
