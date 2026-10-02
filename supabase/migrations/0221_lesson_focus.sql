-- 0221: レッスンノートの「今の課題」（#332）
--
-- 発端: ユーザー依頼「各会員の個人ページ上部に『今の課題』という枠を設けてください。
--   過去のレッスン記録をさかのぼらなくても、現在取り組んでいる課題や練習のポイントを
--   すぐ確認できるようにしたいです」。
--
-- ★ goal（目標）とは別の欄として持つ。
--   goal = 「いつも90台で回りたい」のような長期の目標（1行）。
--   focus = 「いま何を意識して練習するか」で、複数行・入れ替わるもの。
--   既存の goal を使い回すと、目標を書き替えないと課題が更新できなくなる。
--
-- ★ レッスンごとの記録（lsn_lesson_notes）とは別に、生徒1人に1つだけ持つ＝次回以降もそのまま出る。

alter table lsn_students
  add column if not exists focus text,
  add column if not exists focus_updated_at timestamptz,
  add column if not exists focus_by uuid references staff(id);

comment on column lsn_students.focus is
  '今の課題（複数行・改行区切り）。会員ページにもそのまま出る。長期の目標は goal';
comment on column lsn_students.focus_updated_at is '今の課題の最終更新（画面に「◯年◯月◯日」で出す）';
comment on column lsn_students.focus_by is '今の課題を最後に更新したスタッフ';
