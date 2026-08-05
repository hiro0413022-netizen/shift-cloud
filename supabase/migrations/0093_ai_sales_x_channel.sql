-- 0093: AI営業 SNSインバウンドに X（旧Twitter）配信を追加（DECISIONS #103）
--
-- 背景: 2026年2月のX API従量課金化で、月30本なら$6程度で自動投稿が実用圏に入った
--       （旧Basic $200/月・新規Free廃止 → PPU 投稿$0.015/件・リンク付き$0.20/件）。
--
-- 設計（Instagramとの違い）:
--   Instagram … 商品ごとにアカウントを分ける（@swingcortex_jp / @yozan_web_jp）。画像必須・本文リンクは踏めない
--   X         … 会社公式1アカウント @YOZAN_inc に全商品を集約。本文にLPリンクを直接置ける＝計測しやすい
--
--   1投稿(cnt_posts 1行)を「IGとXの両方へ配信する」形にした。行を分けないのは、
--   承認カード(ai_action_queue)が1本＝判断が1回で済むため（承認の粒度を増やさない）。
--   チャネルごとの成否は独立して持つ（片方失敗でも他方の成果は残す）。
--
-- 状態の決め方（publishDue）:
--   いずれか1チャネルでも成功 → status='posted'
--   設定済みチャネルを試して全滅 → status='failed'
--   どのチャネルも未設定       → status='scheduled' のまま（env設定後の次tickで自動投稿）

alter table cnt_posts add column if not exists x_tweet_id text;
alter table cnt_posts add column if not exists x_posted_at timestamptz;
alter table cnt_posts add column if not exists x_error text;

comment on column cnt_posts.ig_media_id is 'Instagram側のメディアID（IG投稿成功の証跡）。商品別アカウント: pganote/swing-cortex=@swingcortex_jp、webdesign=@yozan_web_jp';
comment on column cnt_posts.x_tweet_id is 'X側のツイートID（X投稿成功の証跡）。投稿先は会社公式1アカウント @YOZAN_inc（env X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_SECRET）';
comment on column cnt_posts.x_error is 'X配信の直近の失敗理由 / 未設定の注記。IG側の error 列とは独立（片方の失敗でもう片方を巻き込まない）';

-- platform列はもともと 'instagram' 単独を想定していたが、1行=複数チャネル配信になったので
-- 「主チャネル」の意味に変える（既存行はinstagramのまま。判定コードはこの列を見ていない）。
comment on column cnt_posts.platform is '主チャネルの表示用ラベル。実際の配信可否は ig_media_id / x_tweet_id と各env設定で決まる（1行をIG・Xの両方へ配信する）';
