-- 0064/0065 の巻き戻し用（migrationではない。緊急時に手で流す）
-- 作成: 2026-07-17（適用直前に本番 qrgpblnnhdudigarrtuz の実状態から生成）
--
-- 適用前の状態（実測）:
--   - anon は public スキーマの全テーブル/ビュー 141件に対し一律
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE を保持（= ALL）
--   - golfwing / sales_os スキーマに anon の権限は無し（authenticated と service_role のみ）
--     → 巻き戻しは public スキーマだけでよい
--   - 既定付与: pg_default_acl の public/r・public/S・public/f に anon=... が存在
--   - gnv_* 16ビューは anon / authenticated が ALL を保持
--
-- ⚠ これは「監査前の穴が開いた状態」に戻す操作。原因を特定してから流すこと。

-- ── 0065 の巻き戻し ────────────────────────────────
grant all on all tables    in schema public to anon;
grant all on all sequences in schema public to anon;

alter default privileges for role postgres in schema public   grant all on tables    to anon;
alter default privileges for role postgres in schema public   grant all on sequences to anon;
alter default privileges for role postgres in schema golfwing grant all on tables    to anon;
alter default privileges for role postgres in schema golfwing grant all on sequences to anon;

alter default privileges for role postgres in schema public   grant execute on functions to public;
alter default privileges for role postgres in schema golfwing grant execute on functions to public;

-- ── 0064 の巻き戻し（0065の grant all で gnv_* も戻るが、authenticated 分は別途）──
grant all on all tables in schema public to authenticated;

-- 確認:
--   select count(*) from information_schema.role_table_grants
--   where grantee='anon' and table_schema='public';   -- 期待: 987
