-- 0209: gn_jarvis_turns.intent に 'act' と 'tool' を許可（#290）
-- 発見: 0133 の CHECK に 'act'（#186）が無く、予約を入れた会話が **黙って記録されていなかった**
-- （logTurn は失敗しても会話を止めない設計のため気づかれなかった）。'tool'（P1・Core の読み Tool）も同時に追加。
alter table gn_jarvis_turns drop constraint if exists gn_jarvis_turns_intent_check;
alter table gn_jarvis_turns add constraint gn_jarvis_turns_intent_check
  check (intent in ('brief', 'data', 'navigate', 'dev', 'talk', 'error', 'act', 'tool'));
