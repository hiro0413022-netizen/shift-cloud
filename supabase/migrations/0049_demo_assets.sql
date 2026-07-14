-- 0049_demo_assets.sql
-- AI DEMO SALES — デモ用画像（ヘッダー/院内・診察風景/院長写真）の保管バケット。
--
-- 公開バケット: デモHTML（/d/[token]・認証なし）から <img> で参照するため。
-- パスはランダム（demos/{company}/{prospect}/{rand}）で推測不可。書き込みは service_role の署名URLのみ。
-- 既存サイトの写真は無断利用しない（DECISIONS #54）。院から提供された写真・フリー素材のみを想定。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'demo-assets', 'demo-assets', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
