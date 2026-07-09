-- 0031_survey_golfwing_seed.sql
-- GOLF WING 会員アンケート（コーチ評価 / WING NOTE）初期投入。slug='golfwing-2026'。
-- 冪等: 既に存在する場合は何もしない。※本番は execute_sql で投入済（このファイルはGit-as-truth用）。
-- 対象コーチ: 古川博庸/井殿康和/榎本剛志/安東茉優/春馬凡夫（小川うららは対象外）。

do $$
declare
  v_cid uuid := 'ec00ad2a-4032-4061-bdb7-03face8a04e7';   -- 株式会社YOZAN
  v_store uuid := '82bb4e18-427d-4cc7-a834-c9e2a9b18199'; -- GOLF WING 宝塚
  v_sid uuid;
  v_pool jsonb := '[{"value":"furukawa","label":"古川博庸プロ"},{"value":"idono","label":"井殿康和プロ"},{"value":"enomoto","label":"榎本剛志プロ"},{"value":"ando","label":"安東茉優プロ"},{"value":"haruma","label":"春馬凡夫プロ"}]';
  v_rcfg jsonb;
begin
  if exists (select 1 from svy_surveys where slug = 'golfwing-2026' and deleted_at is null) then
    return;
  end if;

  insert into svy_surveys(company_id, store_id, slug, title, description, purpose, status, is_anonymous, intro_text, thanks_text, est_minutes)
  values (v_cid, v_store, 'golfwing-2026', 'GOLF WING 会員アンケート',
    'コーチのレッスン品質・WING NOTEの改善のための会員アンケートです',
    'コーチ別レッスンスキルの可視化 / 業務態度の改善 / WING NOTEの利用状況・満足度・改善点の把握 / 会員満足度向上・退会防止',
    'open', true,
    'このアンケートは、より良いレッスンとサービスのご提供のためのものです。回答は匿名で、個人が特定されることはありません。所要時間は3〜5分程度です。受講経験のあるコーチについてのみお答えください。',
    'ご協力ありがとうございました。いただいたご意見はレッスンとサービスの改善に活用させていただきます。',
    5)
  returning id into v_sid;

  v_rcfg := jsonb_build_object('source_code','QC','pool', v_pool);

  insert into svy_questions(company_id, survey_id, section, position, code, type, title, help_text, required, options, config) values
  (v_cid, v_sid, 'セクション1 回答者情報', 1, 'Q1', 'single', '性別', null, true,
    '[{"value":"male","label":"男性"},{"value":"female","label":"女性"},{"value":"na","label":"回答しない"}]', '{}'),
  (v_cid, v_sid, 'セクション1 回答者情報', 2, 'Q2', 'single', '年代', null, true,
    '[{"value":"u20","label":"20代以下"},{"value":"30s","label":"30代"},{"value":"40s","label":"40代"},{"value":"50s","label":"50代"},{"value":"o60","label":"60代以上"}]', '{}'),
  (v_cid, v_sid, 'セクション1 回答者情報', 3, 'Q3', 'single', 'ゴルフ歴', null, true,
    '[{"value":"lt6m","label":"半年未満"},{"value":"6m1y","label":"半年〜1年"},{"value":"1to3","label":"1〜3年"},{"value":"3to5","label":"3〜5年"},{"value":"gt5","label":"5年以上"}]', '{}'),
  (v_cid, v_sid, 'セクション1 回答者情報', 4, 'Q4', 'single', 'GOLF WINGの利用割合', null, true,
    '[{"value":"p100","label":"練習100%"},{"value":"p75","label":"練習75%・レッスン25%"},{"value":"half","label":"半々"},{"value":"l75","label":"練習25%・レッスン75%"},{"value":"l100","label":"レッスン100%"}]', '{}'),
  (v_cid, v_sid, 'セクション2 WING NOTEについて', 5, 'Q5', 'single', 'WING NOTEを利用していますか？', null, true,
    '[{"value":"always","label":"毎回利用している"},{"value":"sometimes","label":"時々利用している"},{"value":"rarely","label":"あまり利用していない"},{"value":"never","label":"利用したことがない"}]', '{}'),
  (v_cid, v_sid, 'セクション2 WING NOTEについて', 6, 'Q6', 'single', 'WING NOTEはレッスン内容の振り返りに役立っていますか？', null, false,
    '[{"value":"5","label":"とても役立っている"},{"value":"4","label":"役立っている"},{"value":"3","label":"どちらともいえない"},{"value":"2","label":"あまり役立っていない"},{"value":"1","label":"全く役立っていない"}]', '{}'),
  (v_cid, v_sid, 'セクション2 WING NOTEについて', 7, 'Q7', 'multi', 'WING NOTEで特に役立っている内容を教えてください。', '複数選択可', false,
    '[{"value":"swing_video","label":"スイング動画"},{"value":"coach_comment","label":"コーチからのコメント"},{"value":"menu","label":"練習メニュー"},{"value":"issue","label":"自分の課題が分かること"},{"value":"history","label":"過去のレッスンを見返せること"},{"value":"other","label":"その他"}]',
    '{"allow_other": true}'),
  (v_cid, v_sid, 'セクション2 WING NOTEについて', 8, 'Q8', 'textarea', 'WING NOTEについて改善してほしいことがあれば教えてください。', null, false, '[]', '{}'),
  (v_cid, v_sid, 'セクション3 コーチ評価', 9, 'QC', 'multi', '評価対象のコーチ（受講経験のあるプロ）を選択してください', '選択したコーチのみ、この後の順位付け設問の対象になります。受講経験のないコーチは選ばないでください。', false,
    v_pool, '{"is_ranking_source": true}'),
  (v_cid, v_sid, 'セクション3 コーチ評価', 10, 'Q9', 'ranking', '質問しやすいと感じるプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 11, 'Q10', 'ranking', '説明が分かりやすいプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 12, 'Q11', 'ranking', '課題を見つけるのが上手いプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 13, 'Q12', 'ranking', '自分に合ったアドバイスをしてくれるプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 14, 'Q13', 'ranking', '練習方法を分かりやすく教えてくれるプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 15, 'Q14', 'ranking', '上達につながるレッスンをしてくれるプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 16, 'Q15', 'ranking', 'ゴルフ知識が豊富だと感じるプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 17, 'Q16', 'ranking', '接客・対応が良いと感じるプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 18, 'Q17', 'ranking', '親しみやすいと感じるプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 19, 'Q18', 'ranking', '安心してレッスンを受けられるプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 20, 'Q19', 'ranking', 'またレッスンを受けたいと思うプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 21, 'Q20', 'ranking', '友人・知人へおすすめしたいプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 22, 'Q21', 'ranking', '総合的に最も満足しているプロを順位付けしてください。', 'ドラッグで並び替え（上が1位）', false, v_pool, v_rcfg),
  (v_cid, v_sid, 'セクション3 コーチ評価', 23, 'Q22', 'textarea', '各コーチについて、「ここを改善するとさらに良くなる」と思う点があれば教えてください。', 'コーチ名を添えてご記入ください', false, '[]', '{}'),
  (v_cid, v_sid, 'セクション4 イベント・ご意見', 24, 'Q23', 'multi', '今後開催してほしいイベントを教えてください。', '複数選択可', false,
    '[{"value":"round","label":"ラウンドレッスン"},{"value":"compe","label":"コンペ"},{"value":"management","label":"コースマネジメント講習"},{"value":"approach","label":"アプローチレッスン"},{"value":"putter","label":"パターレッスン"},{"value":"distance","label":"飛距離アップレッスン"},{"value":"fitting","label":"フィッティングイベント"},{"value":"demo","label":"試打会"},{"value":"rule","label":"ゴルフルール講習"},{"value":"social","label":"会員交流イベント"},{"value":"other","label":"その他"}]',
    '{"allow_other": true}'),
  (v_cid, v_sid, 'セクション4 イベント・ご意見', 25, 'Q24', 'textarea', 'GOLF WINGの良いところを教えてください。', null, false, '[]', '{}'),
  (v_cid, v_sid, 'セクション4 イベント・ご意見', 26, 'Q25', 'textarea', 'GOLF WINGで改善してほしいことを教えてください。', null, false, '[]', '{}');
end $$;
