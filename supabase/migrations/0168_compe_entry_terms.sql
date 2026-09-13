-- #239 (2026-09-13) 募集ページに「ご参加にあたってのお願い」と同意チェックを入れる
--
-- 前回（第9回）は Google フォームで、注意事項を読んでから
-- 「上記の注意事項を確認し、同意のうえ申し込みます。」にチェックを入れる形だった。
-- キャンセル料6,600円が発生する以上、同意を取った事実が残っていないと後で揉める。
--
-- ★ 同意文はコンペごとに持つ（会場もキャンセル規定も回によって変わる）。
-- ★ 同意した「時刻」を参加者に残す。チェックしたかどうかの真偽値だけでは、
--   どの文面にいつ同意したのかが後から分からない。
-- ★ 当日オプション（朝の練習会・懇親会）はコンペごとの設問にする。
--   固定で作り込むと、次に別の設問が要るたびにコードを直すことになる。
--   答えは cmp_participants.custom_fields に入り、受付表にそのまま列として並ぶ。

alter table public.cmp_comps
  add column if not exists entry_terms text,
  add column if not exists entry_questions jsonb not null default '[]'::jsonb;

comment on column public.cmp_comps.entry_terms is '募集ページに出す「ご参加にあたってのお願い」。ここが空なら同意チェックは出さない（#239）';
comment on column public.cmp_comps.entry_questions is
  '募集ページの追加設問 [{id,label,options:[],required}]。答えは cmp_participants.custom_fields[id] に入り、reception_fields に同じidを置けば受付表にも出る';

alter table public.cmp_participants
  add column if not exists agreed_at timestamptz;

comment on column public.cmp_participants.agreed_at is '募集ページで注意事項に同意した時刻（#239）。null＝スタッフ登録など同意を取っていない経路';

-- 第10回（/e/gw10）に、第9回のGoogleフォームと同じ文面と設問を入れる
update public.cmp_comps
   set entry_terms =
         '・申し込み後のキャンセルについては、開催日の7日前よりキャンセル料6,600円（税込）が発生いたします。' || chr(10) ||
         '・当日の進行状況により、スケジュールが前後する場合があります。' || chr(10) ||
         '・組み合わせ、スタート時間は主催者にて調整いたします。' || chr(10) ||
         '・プレー中の怪我、盗難、事故等については各自ご注意ください。' || chr(10) ||
         '・当日の写真や動画をSNSや告知に使用させていただく場合があります。',
       entry_questions = '[
         {"id":"q_morning","label":"朝の練習会について","required":true,
          "options":["パターレッスン","アプローチレッスン","未定","参加しない"]},
         {"id":"q_party","label":"懇親会（表彰式）への参加","required":true,
          "options":["参加する","参加しない","未定"]}
       ]'::jsonb,
       reception_fields = reception_fields || '[
         {"id":"q_morning","label":"朝の練習会","type":"text","visible":true},
         {"id":"q_party","label":"懇親会","type":"text","visible":true}
       ]'::jsonb
 where entry_slug = 'gw10';
