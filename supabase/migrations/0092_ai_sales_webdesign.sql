-- 0092: AI営業 SNSインバウンドに商品「webdesign（HP制作）」を追加（DECISIONS #101補足）
--
-- Instagramアカウントを商品グループ別に分けた（2026-08-04作成・vault登録済）:
--   swingcortex_jp … swing-cortex / pganote（コーチ向け）→ env IG_ACCESS_TOKEN / IG_BUSINESS_ID
--   yozan_web_jp   … webdesign（HP制作営業）            → env IG_ACCESS_TOKEN_WEB / IG_BUSINESS_ID_WEB
-- 題材はSWING CORTEX資産ではなく @yozan/content 内の題材リスト（WEB_TOPICS）から取る。

alter table cnt_posts drop constraint if exists cnt_posts_product_check;
alter table cnt_posts add constraint cnt_posts_product_check
  check (product in ('pganote', 'swing-cortex', 'webdesign'));

comment on column cnt_posts.product is 'pganote / swing-cortex = swingcortex_jp へ投稿、webdesign = yozan_web_jp へ投稿（IG envもアカウント別）';
