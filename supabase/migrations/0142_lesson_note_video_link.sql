-- ============================================================
-- 0142: 会話メモ・計測を「本日のレッスン」に紐づける
--
-- 背景（2026-09-03 ユーザー依頼）:
--   「会話メモを本日のレッスンのページに出してほしい。前回何を言っていたかも見たい。
--     お客様への説明を保存したら、その日のスイング動画に紐付いて保存されるようにしてほしい。
--     計測も本日のレッスンにレッスンデータとして紐付けたい」
--
--   それまでは カルテのタブ（本日のレッスン／会話メモ／計測）が完全に別々で、
--   レッスン中にタブを行き来しないと「今日のレッスン」が1枚に見えなかった。
--
-- 設計:
--   **コピーせずに紐づける。** 会話メモの本文を lsn_comments に複製すると、
--   あとから先生がメモを直したときに動画側の文だけ古いまま残る（必ずズレる）。
--   lsn_lesson_notes.video_id で指すだけにして、正典は lsn_lesson_notes のまま。
--
--   計測は 0041 の時点で lsn_measurements.video_id を用意してあったが、
--   画面から一度も使っていなかった。今回そこに入れる（列の追加は不要）。
--
-- 紐づけ先の決め方（@yozan/lesson-os の saveLessonNote 1か所）:
--   保存を押した時点の「その日の最後に撮ったスイング動画」。
--   その日に動画が無ければ null のまま＝日付だけのカードとして残す（消さない）。
-- ============================================================

alter table lsn_lesson_notes add column if not exists video_id uuid references lsn_videos(id);

comment on column lsn_lesson_notes.video_id is
  'このメモを紐づけたスイング動画（その日の最後の1本）。null=動画の無い日のレッスン。本文はコピーせずここで指すだけ';

create index if not exists idx_lsn_lesson_notes_video
  on lsn_lesson_notes (video_id) where deleted_at is null and video_id is not null;

-- 計測は video_id が既にある（0041）。動画から引くための索引だけ足す
create index if not exists idx_lsn_measurements_video
  on lsn_measurements (video_id) where deleted_at is null and video_id is not null;
