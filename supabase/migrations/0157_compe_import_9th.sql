-- #232 (2026-09-10) 第9回ゴルフウィング親睦ゴルフコンペ を genspark から移行（適用済み・記録用）
--
-- 旧 golf_savedata の JSON 1本（user_id=bd8561c4 / GOLFWING アカウント・2026-06-05 時点）を展開したもの。
-- ★ 性別だけ手で直した: 播磨久美子さん・宮﨑聖子さんは新しい方のレコードで male になっていたが、
--   5/16 時点の古いレコードでは female だった（受付画面の作り直し時に既定値で上書きされたと見られる）。
-- ★ 森井淳司さんの HCP 100 は旧データのまま（明らかな打ち間違いだが、勝手に直さない）。
-- ★ スコアは旧データが空だったため入れていない（当日は紙で回した）。

insert into public.cmp_comps (id, company_id, store_id, name, held_on, venue, course, organizer, contact, fee, start_time, meet_time, format, team_size, tee_options, notes, ann_greeting, ann_closing, ann_group_title, ann_show_hcp, survey_title, survey_desc, survey_questions, reception_fields, sheet_cols, status) values (
  '95473a1d-54ef-4636-b80b-4b12ec60a2be', 'ec00ad2a-4032-4061-bdb7-03face8a04e7', '82bb4e18-427d-4cc7-a834-c9e2a9b18199', '第9回ゴルフウィング親睦ゴルフコンペ', '2026-05-19', '吉川カントリー倶楽部', null, 'GOLF WING 宝塚', '0797-82-0833', 3000, '8:30', '練習開始7：10　集合8:10', 'peria_double36', 4, array['1番ホール', '10番ホール'], null, '下記の通りゴルフコンペを開催いたしますので、ご案内申し上げます。
【競技方法】ダブルペリア（ダブルパーカット）
ニアピン OUT No5 、No8　IN No.14 、No15
ドラコン賞アウト No9
団体戦：FWキープ数（プロを除く上位2人の合計数）
【表彰式について】
最終組ホールアウト20分後よりレストランにて開催します。', 'ご不明な点がございましたら、担当者までお問い合わせください。
ご参加を心よりお待ちしております。', '■ 組み合わせ表', false, null, null, '[]'::jsonb, '[{"id":"rf_checkin","label":"受付","type":"checkin","visible":true,"builtin":true},{"id":"rf_paid","label":"参加費","type":"paid","visible":true,"builtin":true},{"id":"rf_time","label":"受付時刻","type":"time","visible":true,"builtin":true},{"id":"rf_notes","label":"メモ","type":"notes","visible":true,"builtin":true},{"id":"rf_mpbqxbq9dvli1","label":"懇親会","type":"check","visible":true,"builtin":false}]'::jsonb, '{}'::jsonb, 'closed');

insert into public.cmp_participants (id, comp_id, name, kana, hcp, gender, org, tel, email, notes, paid, checked_in, check_in_at, custom_fields, sort_order) values
  ('919298ea-6979-46c4-bcbc-cc1a025bf2c0', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '播磨久美子', 'ハリマ　クミコ', null, 'female', null, '090-5152-9900', 'mqeawggp971@docomo.ne.jp', null, true, true, '2026-05-19T07:02:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 0),
  ('e9b1f676-0e94-42fb-aad0-0bfe41ea2a5d', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '宮﨑　聖子', 'ミヤザキ　セイコ', null, 'female', null, '090-4031-7675', 'wshuna.mama.seiko@gmail.com', null, false, false, null, '{}'::jsonb, 1),
  ('e5384e32-78e8-4d48-874e-4ed934aa552c', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '高砂　行彦', 'タカサゴ　ユキヒコ', 18.6, 'male', null, '080-5513-1042', 'yuk.takasago@gmail.com', null, true, true, '2026-05-19T06:59:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 2),
  ('9bec1a6e-e246-4585-afe4-545027a8b97a', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '中嶋 祐二', 'ナカシマ ユウジ', null, 'male', null, '080-6107-8207', 'you.nakasy@gmail.com', null, true, true, '2026-05-19T07:08:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 3),
  ('36fd2a2e-62e4-4d11-8623-85ed30de7a50', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '中尾 正', 'ナカオ　タダシ', 9.2, 'male', null, '090-9882-6111', 'jam0405@yahoo.ne.jp', null, false, false, null, '{}'::jsonb, 4),
  ('b5c08d70-ed34-4950-af2b-0bcb4a647b46', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '新名 清澄', 'シンミョウ キヨスミ', 12, 'male', null, '090-1952-6835', 'shin331115@gmail.com', null, false, false, null, '{}'::jsonb, 5),
  ('8f4f0fc7-0168-4f09-b0d0-a1d87a96992b', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '原田　和哉', 'ハラダ　カズヤ', null, 'male', null, '090-3842-1203', 'kzyaua117@gmail.com', null, true, true, '2026-05-19T07:16:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 6),
  ('7ca2b3ea-939f-43de-9002-59fb71c8cdfb', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '田中博之', 'タナカヒロユキ', 19, 'male', null, '090-9696-7031', 'hiro.tee.27-72@ezweb.ne.jp', null, true, true, '2026-05-19T07:24:00+09:00', '{}'::jsonb, 7),
  ('d64efb0d-7e1c-4046-b920-fb370aa7f044', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '大黒雄介', 'ダイコクユウスケ', 10, 'male', null, '080-1128-0006', 'daikoku.yusuke@gmail.com', null, true, true, '2026-05-19T07:03:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 8),
  ('7e8f835b-11ca-49bd-9798-a878727e3f6b', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '木原　正道', 'キハラ　マサミチ', 7, 'male', null, '090-9623-5402', 'kih_mvc@hotmail.com', null, true, true, '2026-05-19T07:13:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 9),
  ('b3df7e48-9972-4375-bb8d-e4a037dda205', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '古賀　勉', 'コガ　ツトム', null, 'male', null, '080-5270-5656', 'okkoogaaig@yahoo.co.jp', null, true, true, '2026-05-19T07:27:00+09:00', '{}'::jsonb, 10),
  ('2524f8b3-c9c6-49c5-b658-959151d8741a', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '桑門　心', 'クワカド　シン', 15, 'male', null, '090-6961-4761', 'in2075@icloud.com', null, true, true, '2026-05-19T07:24:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 11),
  ('705a0666-4cb3-4b46-8df7-316d15e10578', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '上田恭司', 'ウエダヤスジ', null, 'male', null, '090-3488-1818', 'yassing.yazzy@icloud.com', null, false, false, null, '{}'::jsonb, 12),
  ('c6cc9b1d-f1ad-481d-8238-5fae3559e42c', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '亀井 義則', 'カメイ ヨシノリ', 11, 'male', null, '090-9257-2022', 'kamei_yoshinori@yahoo.ne.jp', null, true, true, '2026-05-19T07:13:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 13),
  ('bd8988d7-c129-4eb4-816f-aff3635d9d95', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '俣野 徹', 'マタノ トオル', 15, 'male', null, '090-6238-8828', 'tochan-4653-55par72@ezweb.ne.jp', null, true, true, '2026-05-19T06:59:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 14),
  ('60e16710-ddd1-462b-9f4d-e4fe1332b7e7', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '中村 均', 'ナカムラ ヒトシ', 15.9, 'male', null, '090-3991-7590', 'hnkmr67@gmail.com', null, true, true, '2026-05-19T07:08:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 15),
  ('52e38dc5-28e9-4cf5-b877-ece583dc1c8a', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '田渕一', 'タブチハジメ', null, 'male', null, '090-3285-2063', 'sinseigiken@icloud.com', null, true, true, '2026-05-19T06:58:00+09:00', '{"rf_mpbqxbq9dvli1":false}'::jsonb, 16),
  ('032eebe1-4f65-4b0a-827c-e52c75f38e54', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '森井淳司', 'モリイジュンジ', 100, 'male', null, '090-4646-8669', 'junji0405@hotmail.co.jp', null, false, false, null, '{}'::jsonb, 17),
  ('c934d2d4-4e05-4075-9fcf-feb019ccca47', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '川端一寿', 'カワバタカズヒサ', null, 'male', null, '090-9232-5580', 'kazuhisakawabata0426@gmail.com', null, true, true, '2026-05-19T06:58:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 18),
  ('c7d09934-67e6-4156-8e06-8cbbeed45ddd', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '入澤剛', 'イリザワツヨシ', null, 'male', null, '090-1799-3601', 'iritsuyo0328@icloud.com', null, true, true, '2026-05-19T06:59:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 19),
  ('db6b9f05-a10a-42f7-957a-745158bc7a83', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '岡本　賢史', 'オカモト　ケンジ', null, 'male', null, '090-1024-2506', 'fu5.pan7ac0tta@gmail.com', null, true, true, '2026-05-19T06:59:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 20),
  ('003fb682-4ece-4e8f-96dc-e17b25305a0f', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '古川 博庸', null, null, 'male', null, null, null, null, false, true, '2026-05-19T07:04:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 21),
  ('518eca46-afb1-484d-a35b-f1697871397b', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '井殿 康和', null, null, 'male', null, null, null, null, false, true, '2026-05-19T07:04:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 22),
  ('1b030d8d-8b73-4d1d-b44a-4a6b69945b29', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '井殿 康和 後半', null, null, 'male', null, null, null, null, false, true, '2026-05-19T07:04:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 23),
  ('36b6dac7-e0b3-4e05-b433-de6519cb1e4c', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '福原 大輔', null, null, 'male', null, null, null, null, false, true, '2026-05-19T07:04:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 24),
  ('039a0126-b21d-4e15-bdbb-e34ee74d2799', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '福原大輔 後半', null, null, 'male', null, null, null, null, false, true, '2026-05-19T07:04:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 25),
  ('3d57e9e5-e3a4-4a63-9501-95b6aa18c4f2', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '安東 茉優', null, null, 'male', null, null, null, null, false, true, '2026-05-19T07:04:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 26),
  ('4bee02ad-d365-4129-b3df-b7eee21e4a83', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '榎本 剛志', null, null, 'male', null, null, null, null, false, true, '2026-05-19T07:04:00+09:00', '{"rf_mpbqxbq9dvli1":true}'::jsonb, 27);

insert into public.cmp_groups (id, comp_id, name, tee, start_time, sort_order) values
  ('3098d637-b81a-4b11-b97b-bfbf339ab0f3', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '1組', '1番ホール', '8:30', 0),
  ('0eff21c2-1c9e-46b7-8733-010692984dcf', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '2組', '1番ホール', '8:37', 1),
  ('596e7df1-5546-4c79-854d-80fce510c119', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '3組', '1番ホール', '8:42', 2),
  ('e67b884a-3945-4e40-847e-40df4e5d8e9f', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '4組', '1番ホール', '8:49', 3),
  ('f3899dc4-d337-47b7-bdee-2791178bfc4e', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '1組', '10番ホール', '8:30', 4),
  ('3f550f68-cb9d-4939-b97d-9df0b43185f6', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '2組', '10番ホール', '8:37', 5),
  ('6101180f-0037-4b69-908b-0e8d388f3f31', '95473a1d-54ef-4636-b80b-4b12ec60a2be', '3組', '10番ホール', '8:42', 6);

insert into public.cmp_group_members (group_id, participant_id, position) values
  ('3098d637-b81a-4b11-b97b-bfbf339ab0f3', 'e9b1f676-0e94-42fb-aad0-0bfe41ea2a5d', 0),
  ('3098d637-b81a-4b11-b97b-bfbf339ab0f3', '9bec1a6e-e246-4585-afe4-545027a8b97a', 1),
  ('3098d637-b81a-4b11-b97b-bfbf339ab0f3', '8f4f0fc7-0168-4f09-b0d0-a1d87a96992b', 2),
  ('3098d637-b81a-4b11-b97b-bfbf339ab0f3', '003fb682-4ece-4e8f-96dc-e17b25305a0f', 3),
  ('0eff21c2-1c9e-46b7-8733-010692984dcf', '2524f8b3-c9c6-49c5-b658-959151d8741a', 0),
  ('0eff21c2-1c9e-46b7-8733-010692984dcf', '7e8f835b-11ca-49bd-9798-a878727e3f6b', 1),
  ('0eff21c2-1c9e-46b7-8733-010692984dcf', '919298ea-6979-46c4-bcbc-cc1a025bf2c0', 2),
  ('0eff21c2-1c9e-46b7-8733-010692984dcf', '3d57e9e5-e3a4-4a63-9501-95b6aa18c4f2', 3),
  ('596e7df1-5546-4c79-854d-80fce510c119', 'b5c08d70-ed34-4950-af2b-0bcb4a647b46', 0),
  ('596e7df1-5546-4c79-854d-80fce510c119', '7ca2b3ea-939f-43de-9002-59fb71c8cdfb', 1),
  ('596e7df1-5546-4c79-854d-80fce510c119', 'bd8988d7-c129-4eb4-816f-aff3635d9d95', 2),
  ('596e7df1-5546-4c79-854d-80fce510c119', '518eca46-afb1-484d-a35b-f1697871397b', 3),
  ('e67b884a-3945-4e40-847e-40df4e5d8e9f', '52e38dc5-28e9-4cf5-b877-ece583dc1c8a', 0),
  ('e67b884a-3945-4e40-847e-40df4e5d8e9f', 'c7d09934-67e6-4156-8e06-8cbbeed45ddd', 1),
  ('e67b884a-3945-4e40-847e-40df4e5d8e9f', 'd64efb0d-7e1c-4046-b920-fb370aa7f044', 2),
  ('e67b884a-3945-4e40-847e-40df4e5d8e9f', '1b030d8d-8b73-4d1d-b44a-4a6b69945b29', 3),
  ('f3899dc4-d337-47b7-bdee-2791178bfc4e', 'e5384e32-78e8-4d48-874e-4ed934aa552c', 0),
  ('f3899dc4-d337-47b7-bdee-2791178bfc4e', 'b3df7e48-9972-4375-bb8d-e4a037dda205', 1),
  ('f3899dc4-d337-47b7-bdee-2791178bfc4e', '60e16710-ddd1-462b-9f4d-e4fe1332b7e7', 2),
  ('f3899dc4-d337-47b7-bdee-2791178bfc4e', '36b6dac7-e0b3-4e05-b433-de6519cb1e4c', 3),
  ('3f550f68-cb9d-4939-b97d-9df0b43185f6', 'db6b9f05-a10a-42f7-957a-745158bc7a83', 0),
  ('3f550f68-cb9d-4939-b97d-9df0b43185f6', 'c6cc9b1d-f1ad-481d-8238-5fae3559e42c', 1),
  ('3f550f68-cb9d-4939-b97d-9df0b43185f6', '36fd2a2e-62e4-4d11-8623-85ed30de7a50', 2),
  ('3f550f68-cb9d-4939-b97d-9df0b43185f6', '039a0126-b21d-4e15-bdbb-e34ee74d2799', 3),
  ('6101180f-0037-4b69-908b-0e8d388f3f31', '032eebe1-4f65-4b0a-827c-e52c75f38e54', 0),
  ('6101180f-0037-4b69-908b-0e8d388f3f31', '705a0666-4cb3-4b46-8df7-316d15e10578', 1),
  ('6101180f-0037-4b69-908b-0e8d388f3f31', 'c934d2d4-4e05-4075-9fcf-feb019ccca47', 2),
  ('6101180f-0037-4b69-908b-0e8d388f3f31', '4bee02ad-d365-4129-b3df-b7eee21e4a83', 3);

insert into public.cmp_prizes (comp_id, label, prize_name, sort_order) values
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '🥇 優勝', 'ゴルフウィング金券　20,000円分', 0),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '🥈 準優勝', 'ゴルフウィング金券　10,000円分', 1),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '🥉 3位', 'ゴルフウィング金券　　　5,000円分', 2),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '5位', '国産和牛 山竹すき焼き肉', 3),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '7位', 'kanekanekobo 本革オーダメイドヘッドカバー　', 4),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '10位', '国産和牛 山竹すき焼き肉', 5),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '15位', '国産生豚 山竹しゃぶしゃぶ肉', 6),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '🎭 ブービー', 'パーソナルレッスン無料券', 7),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '🎯 ニアピン', '上田様　協賛　お米 3キロ', 8),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '💪 ドラコン', 'カラダフィッティング　　　無料券', 9),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', 'ベストグロス', 'ZERO FIT グローブ 2枚', 10);

insert into public.cmp_teams (comp_id, name, group_name, score, rank_label, note, members, sort_order) values
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '1組', '1組', null, null, null, '宮﨑　聖子・中嶋 祐二・原田　和哉', 0),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '2組', '2組', null, null, null, '桑門　心・木原　正道・播磨久美子', 1),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '3組', '3組', null, null, null, '高砂　行彦・古賀　勉・中村 均', 2),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '4組', '4組', null, null, null, '岡本　賢史・亀井 義則・中尾　正', 3),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '1組', '1組', null, null, null, '新名 清澄・田中博之・俣野 徹', 4),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '2組', '2組', null, null, null, '田渕一・入澤剛・大黒雄介', 5),
  ('95473a1d-54ef-4636-b80b-4b12ec60a2be', '3組', '3組', null, null, null, '森井淳司・上田恭司・川端一寿', 6);
