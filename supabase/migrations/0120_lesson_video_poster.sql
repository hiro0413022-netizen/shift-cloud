-- ============================================================
-- 0120: スイング動画のサムネイル（1コマ目の静止画）
--
-- 背景（2026-08-22 ユーザー依頼）:
--   「スマホで見たらすでに動画の最初の画面が表示されていて、それを押したら再生される感じで」
--
--   これまでカルテの動画は「▶ 再生・描画をひらく」というグレーの箱で、
--   押す → サーバーアクションで署名URLを取りに行く → やっと読み込み、と一拍待たされていた。
--   一覧に <video preload="metadata"> を並べれば1コマ目は出るが、
--   本数ぶんレンジリクエストが飛ぶ（現場は4G・1人20本超になる）。
--
--   そこで **登録時にブラウザで1コマ目を切り出してJPEGとして保存**し、
--   一覧は poster 画像だけ（数十KB）を出す。動画本体は押されるまで1バイトも読まない。
--
-- 追加のみ（DECISIONS #2）。既存の動画は poster_path が null＝従来どおり
-- preload="metadata" にフォールバックするので、遡って作り直す必要はない。
-- ============================================================

alter table lsn_videos       add column if not exists poster_path text;
alter table lsn_model_videos add column if not exists poster_path text;

comment on column lsn_videos.poster_path is '1コマ目のJPEG（lesson-videos バケット）。一覧のサムネイル用。nullなら動画のメタデータから表示';
comment on column lsn_model_videos.poster_path is '1コマ目のJPEG（lesson-videos バケット）';
