-- 0096: X（旧Twitter）の連続投稿（スレッド）対応 + 会社紹介商品「yozan」の追加
--
-- 背景:
--   これまで cnt_posts 1行 = 単発投稿1本で、連投（スレッド）が作れなかった。
--   会社紹介のように「1本では説明しきれない話」は、Xでは連続投稿が正攻法。
--   PC上のブラウザ操作で人が投稿する運用は、PCを開いていないと動かない＝仕組みとして成立しない。
--   既存の10分cron（/api/cron/execute → publishDue）にスレッドを乗せて、サーバー側だけで完結させる。
--
-- 設計（なぜ別テーブルにしないか）:
--   スレッドは「1つの投稿意図」であって、承認も成果計測も1本単位で見たい。
--   行を分けると ai_action_queue の承認カードが9枚に増える＝判断の粒度が壊れる（0093と同じ理由）。
--   よって cnt_posts に配列2本を足して 1行 = 1スレッド とする。
--
--   thread_parts     … 投稿する本文を順番に並べたもの。空配列 = 従来どおりの単発投稿
--   thread_tweet_ids … 投稿できたツイートIDを順番に積む。**進捗そのもの**
--
--   途中で失敗しても、次のtickは thread_tweet_ids.length 番目から再開し、
--   直前の要素を in_reply_to_tweet_id にする＝同じ投稿を二度出さずにスレッドが繋がる。
--   （X APIは429/一時エラーがそれなりに出る。9本を全部やり直す設計にはしない）
--
-- platform列の意味を復活させる:
--   0093では「表示用ラベル・判定コードは見ていない」としたが、会社紹介スレッドのように
--   「Xだけに出したい（Instagramには出さない）」投稿が出てきたので、判定に使う。
--     platform='x'  → Instagramへは配信しない（X専用）
--     それ以外      → 従来どおりIG・Xの両方へ配信
--
-- 新関数なし（service_roleへのEXECUTE付与対象なし・#65）

alter table cnt_posts add column if not exists thread_parts text[] not null default '{}';
alter table cnt_posts add column if not exists thread_tweet_ids text[] not null default '{}';

-- 会社紹介・採用・お知らせなど「商品の売り込みではないYOZAN公式の発信」の受け皿。
-- LP_PATH に無いのでリンクは自動付与されない（本文に書いたURLだけが載る）。
alter table cnt_posts drop constraint if exists cnt_posts_product_check;
alter table cnt_posts add constraint cnt_posts_product_check
  check (product in ('pganote', 'swing-cortex', 'webdesign', 'yozan'));

comment on column cnt_posts.thread_parts is 'X連続投稿（スレッド）の本文を順番に並べた配列。空 = 単発投稿。各要素は280重み以内（全角2・URL23）';
comment on column cnt_posts.thread_tweet_ids is 'スレッドで投稿済みのツイートIDを順番に積んだ配列＝進捗。途中失敗時はこの長さから再開し、末尾を親にして返信で繋ぐ';
comment on column cnt_posts.product is 'pganote / swing-cortex = swingcortex_jp へ投稿、webdesign = yozan_web_jp、yozan = 会社公式の発信（X専用・IGアカウントなし）';
comment on column cnt_posts.platform is E'配信先の指定。\'x\' = X専用（Instagramへは配信しない）／\'instagram\' = IGとXの両方へ配信（0096で判定に使うようになった。0093時点は表示ラベルのみ）';
