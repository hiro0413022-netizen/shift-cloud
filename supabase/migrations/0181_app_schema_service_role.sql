-- 0181 service_role に app スキーマの USAGE を付ける
--
-- 0179/0180 の mbr_search_people は app.kana()（ひらがな→カタカナ寄せ）を呼ぶ。
-- app スキーマは postgres と authenticated にしか USAGE が無く、アプリ（service_role）から
-- PostgREST 経由で呼ぶと "permission denied for schema app" → 403 で、
-- money-os のお客様検索が何も返さなかった（本番ログ: 2026-09-14 09:00〜10:00 に 20回以上）。
--
-- 教訓: RPC の動作確認は postgres ではなく、アプリが使うロール（set local role service_role）で行う。
grant usage on schema app to service_role;
grant execute on function app.kana(text) to service_role, authenticated;
notify pgrst, 'reload schema';
