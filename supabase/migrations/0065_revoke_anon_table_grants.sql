-- 0065: anon からテーブル権限を剥奪し、既定付与（ALTER DEFAULT PRIVILEGES）も塞ぐ
--
-- 背景（監査 2026-07-17）:
--   public スキーマの約140テーブルに anon が ALL（arwdDxtm = INSERT/SELECT/UPDATE/DELETE/TRUNCATE/
--   REFERENCES/TRIGGER）を持っていた。これは YOZAN 側のミスではなく Supabase プロジェクトの
--   既定 ACL（pg_default_acl: public/r → anon=arwdDxtm）で、「RLS で止める」のが Supabase の設計思想。
--   実際、全テーブルで RLS は有効・anon 向けポリシーは実質ゼロなので現状の実害はない。
--
--   それでも塞ぐ理由:
--     1) TRUNCATE は RLS を無視する。PostgREST が TRUNCATE を発行しないので今は無害だが、
--        「RLS が唯一の防波堤」という状態を1枚に頼りたくない。
--     2) 新テーブルを作るたびに同じ穴が自動で開く。ポリシーの付け忘れ = 即全開。
--     3) YOZAN の実装は「ログイン後は authenticated / 公開ルートは service_role + トークン検証」
--        （packages/core/supabase/admin.ts, DECISIONS #11/#12/#18/#23）。anon ロールが
--        業務テーブルに触る経路は設計上存在しない。権限が要件と食い違っている。
--
-- 影響確認済み（壊れないこと）:
--   - anon キーの用途は Auth セッション（@supabase/ssr）のみ。ログイン後は authenticated ロールになる。
--   - apps/corporate は anon クライアントを生成しているが .from() 呼び出しゼロ（未使用）。
--   - 公開フォーム（survey-os / member-os / reserve-os / lesson-os 共有）は service_role 経由。
--   - authenticated / service_role の権限には一切触れない。
--
-- 適用済み: 2026-07-17（Supabase本番 qrgpblnnhdudigarrtuz、MCP name=revoke_anon_table_grants）
-- 検証済み:
--   - anon のテーブル権限 987件 → 0件（public/golfwing/sales_os）
--   - authenticated は 1014件 → 902件（差分112 = gnv_*16本×7権限 = 0064の分のみ。業務テーブルは無傷）
--   - 巻き戻し用SQL: supabase/migrations/rollback_0064_0065.sql

-- ── 1) 既存オブジェクトから anon を剥奪 ─────────────────────────────
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as rel
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'golfwing', 'sales_os')
      and c.relkind in ('r', 'v', 'm', 'p')   -- table / view / matview / partitioned
    order by 1
  loop
    execute format('revoke all on %s from anon', r.rel);
  end loop;
end $$;

revoke all on all sequences in schema public   from anon;
revoke all on all sequences in schema golfwing from anon;
revoke all on all sequences in schema sales_os from anon;

-- ── 2) 既定付与を止める（今後作る新テーブルに穴が開かないように） ──────
-- 注: ALTER DEFAULT PRIVILEGES は「そのロールが作る新オブジェクト」にのみ効く。
--     migration は Supabase MCP apply_migration = postgres ロールで走るのでこれで足りる。
alter default privileges for role postgres in schema public   revoke all on tables    from anon;
alter default privileges for role postgres in schema public   revoke all on sequences from anon;
alter default privileges for role postgres in schema golfwing revoke all on tables    from anon;
alter default privileges for role postgres in schema golfwing revoke all on sequences from anon;

-- ── 3) 関数の既定 EXECUTE を塞ぐ（DECISIONS #54/#55 の再発防止） ────────
-- Postgres は新しい関数に PUBLIC への EXECUTE を自動で付ける。0055 はまさにこれを踏んで、
-- anon から revoke したのに PUBLIC 経由で実行できていた。個別対応ではなく既定を変える。
--
-- ⚠ 運用ルールが1つ増える:
--    今後 public/golfwing に SECURITY DEFINER 関数を作る migration では、末尾に必ず
--      grant execute on function public.<関数名>(<引数型>) to service_role;
--    を書くこと（PUBLIC 経由の暗黙 EXECUTE が無くなるため）。README にも記載。
--    既存関数の権限は変わらない（既定付与は遡及しない）ので、現行アプリは無影響。
alter default privileges for role postgres in schema public   revoke execute on functions from public;
alter default privileges for role postgres in schema golfwing revoke execute on functions from public;

-- 確認（適用後に手で実行）:
--
--   -- (a) anon がテーブル権限を1つも持たないこと → 0行
--   select table_schema, table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee = 'anon' and table_schema in ('public','golfwing','sales_os');
--
--   -- (b) 既定付与から anon が消えたこと（public/r の acl に anon= が無いこと）
--   select coalesce(n.nspname,'-') as schema, d.defaclobjtype as objtype, d.defaclacl::text as acl
--   from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
--   where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname in ('public','golfwing');
--
--   -- (c) 既存アプリが無事なこと: authenticated の権限が残っていること → 多数行
--   select count(*) from information_schema.role_table_grants
--   where grantee = 'authenticated' and table_schema = 'public';
