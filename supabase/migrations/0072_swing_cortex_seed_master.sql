-- 0072_swing_cortex_seed_master.sql
-- SWING CORTEX 項目マスタ(46症状/53チェック項目)をDBへ投入。**DB=正典**（Excelは書き出しスナップショット）。
-- docs/modules/swing-cortex/SWING_CORTEX_項目マスタ.xlsx と同一データから自動生成。
-- source列でseed由来を識別し、再実行時は source='seed' を消して再投入＝冪等。manual/import/ai は保持。
-- 依存: 0069(sc_symptoms/checkpoints/knowledge)。全テナントに starter として配布。

alter table sc_symptoms  add column if not exists source text not null default 'manual';

do $$
declare c record; v_sym uuid; v_cp uuid;
begin
  for c in select id as company_id from companies loop
    -- 再実行時の重複防止＋0069の旧シード(knowledge.source='seed')も掃除。manual/import/ai は保持。
    delete from sc_symptoms s
     where s.company_id = c.company_id
       and ( s.source = 'seed'
          or exists (
               select 1 from sc_checkpoints cp
               join sc_knowledge k on k.checkpoint_id = cp.id
               where cp.symptom_id = s.id and k.source = 'seed'
             ) );
    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','スライス',null,array['右に曲がる','こすり球','カット','アウトサイドイン','フェースが開く']::text[],10,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'スタンス・アライメント') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'オープンに構え外から内(カット軌道)になりフェースが開く','肩・腰・つま先を目標と平行にスクエアに立つ','アライメントスティック2本で足と目標線を平行に確認','今は開いて立つ癖で右に逃げやすい状態です。まず目標にまっすぐ立つことから整えましょう。','seed');
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,2,'グリップ') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'ウィークグリップでインパクトでフェースが開いて戻る','左手を少し被せ左手甲が目標を向く形に','ハーフスイングでフェース向きを確認しながら10球','握りが薄く当たる瞬間にフェースが開きやすいです。少し整えると自然につかまります。','seed');
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,3,'スイング軌道') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'上体から切り返しアウトサイドインになっている','下半身リードで内側から。切り返しに一瞬の間をつくる','8-4ドリルで三角形をキープ','体が先に開いて外から下りる動きです。順番を覚えると軌道が整いスライスが減ります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','フック/チーピン',null,array['左に曲がる','巻く','被る','インサイドアウト','つかまりすぎ']::text[],20,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'グリップ') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'ストロンググリップでフェースが被る','左手をやや戻しスクエアへ','左手甲が正面を向く位置でハーフスイング','握りが強くフェースが被りやすい状態です。少し戻すと左への引っかけが減ります。','seed');
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,2,'体の開き・手の返し') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'下半身が止まり手で返しすぎる','回転を止めず体で振り抜く','フィニッシュまで胸を回すショルダーターンドリル','手先で返しすぎる動きです。体の回転で振り抜くと球が安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','プッシュ',null,array['右へまっすぐ出る','押し出し']::text[],30,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'体の流れ・軸') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'インパクトで体が右に残りフェースが開かず右へ押し出す','左への踏み込みで正面インパクトを迎える','足踏みドリルで重心移動を入れる','体が右に残って右に押し出しています。左への移動を入れると方向が安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','プル/引っかけ',null,array['左へまっすぐ出る','左に飛ぶ']::text[],40,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'軌道・上体先行') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'アウトサイドインで上体が突っ込み左へ引っかける','下半身始動で軌道をインから、上体を我慢','切り返しで間をつくる8-4ドリル','体が早く開いて左へ引っかけています。下から動く順番を作りましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','ダフリ',null,array['手前を叩く','ザックリ','地面']::text[],50,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'軸の上下動') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'前傾が起き上がる・沈むなど軸が上下して最下点がズレる','前傾角をキープし頭の高さを保つ','壁ドリルで前傾角を一定に保つ素振り','スイング中に体が上下して手前を叩いています。前傾の高さを保つ意識が有効です。','seed');
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,2,'重心・体重移動') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'右足体重のまま打ちにいき最下点が右に寄る','左への踏み込みで最下点を前に','足踏み→ベタ足ドリルで左重心を体感','右に残って手前を叩いています。左へ乗る動きでダフリが減ります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','トップ',null,array['上を叩く','球が上がらない','こすり']::text[],60,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'軸の伸び上がり') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'インパクトで伸び上がり・前傾がほどけて芯の上を叩く','前傾キープでヘッドの重みを感じて振る','前傾維持のハーフスイングでミートを確認','当たる瞬間に体が起きています。前傾を保つとミートが安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','シャンク',null,array['ネックに当たる','右前へ飛ぶ']::text[],70,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'手元の前傾・ライ') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'前腕を捻りクラブが寝てヒール寄りに入る','三角形同調で縦振り、ヒールで構える意識','三角形ドリル＋Gooドリルで軌道を整える','クラブが寝て入りネックに当たっています。縦の振りを意識すると改善します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','テンプラ/吹け上がり',null,array['高く上がって飛ばない','スピン過多']::text[],80,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'打点・入射角') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'上から打ち込みすぎ・のけぞって上っ面を叩く','ティーアップと入射角を整え、払い打つ','ティー高さを一定にした連続素振り','球が上に吹けて飛距離をロスしています。払うイメージで当たりを整えましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','チョロ/空振り',null,array['当たらない','かする']::text[],90,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'アドレス再現・タイミング') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'力みやアドレスの崩れでヘッドが戻らない','ゆっくり大きく、リズム重視でアドレス再現','連続素振りドリルでタイミングを作る','力みでタイミングがずれています。ゆっくり大きく振ると当たりが戻ります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','飛距離不足',null,array['飛ばない','飛ばしたい']::text[],100,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'捻転・体重移動') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'捻転が浅く手打ちでパワーが伝わらない','深い捻転と左への踏み込みで地面反力を使う','足踏み＋ウェイトシフトドリル','体のねじれと移動が使えると飛距離が伸びます。まず捻転を深くしましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','球が上がらない',null,array['低い','転がる']::text[],110,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'ロフト・ハンドファースト') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'ハンドファースト過多やすくい打ちでロフトが立つ/寝る','ヘッドの重みで払い、適正ロフトで当てる','ハーフスイングで打ち出しをチェック','球が上がりにくい当たりです。ヘッドの重みを感じて払うと高さが出ます。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','方向性が安定しない',null,array['散らばる','曲がりが読めない']::text[],120,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'フェース向きの再現') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'グリップ・軌道のばらつきでフェース向きが不安定','グリップとアライメントを固定しハーフから再現性を作る','ハーフスイングでフェース向きを毎球確認','当たりの向きがばらついています。まず握りと向きを固定して再現性を作りましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'A. 球筋・ミス','ミート率が低い',null,array['芯を外す','当たりが薄い']::text[],130,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'軸の安定') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'スウェーや上下動で打点が毎回ずれる','軸を保ち三角形同調でコンパクトに振る','ベタ足＋三角形同調ドリル','打点がばらついています。軸を保つと芯に当たる確率が上がります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'B. アドレス・準備','グリップ不良',null,array['握り','ウィーク','ストロング']::text[],140,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'握りの向き') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'フェース向きが戻らずスライス/フックの原因になる','左手甲の向きをスクエアに、両手の一体感を作る','グリップチェック＋ハーフスイング','握りが当たりの向きを左右します。まずニュートラルに整えましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'B. アドレス・準備','アドレス姿勢の不良',null,array['猫背','前傾が浅い','構え','重心が高い']::text[],150,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'猫背') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'背中が丸まり重心が高く軸が不安定、右肩が前に出やすい','胸を張り背筋を伸ばしお尻を後ろに引いた前傾','背中にクラブを当て頭・背中・お尻を一直線に','背中が丸まると軸がぶれます。胸を張った姿勢づくりを優先しましょう。','seed');
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,2,'骨盤の後傾') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'骨盤が寝て前傾が作れず手打ちになる','お尻を突き出し股関節から前傾する','壁にお尻をつけて前傾角を確認','骨盤が寝て前傾が浅い状態です。お尻から前傾すると体で振れます。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'B. アドレス・準備','スタンス幅・向き',null,array['広すぎ','狭すぎ','向き']::text[],160,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'幅の適正') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'広すぎ/狭すぎで回転や軸が不安定になる','肩幅目安、番手で微調整し回転しやすい幅に','狭めスタンスで軸回転を体感する素振り','スタンスが合っていません。回転しやすい幅に整えると安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'B. アドレス・準備','ボール位置',null,array['左足','右足','中央']::text[],170,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'位置の最適化') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'位置がズレて入射角・フェース向きが乱れる','番手ごとに基準位置(DRは左踵内側等)を決める','ボール位置を毎回そろえるルーティン','ボール位置のズレが当たりを乱しています。番手ごとの基準を作りましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'B. アドレス・準備','アライメント不良',null,array['向き','目標','スクエア']::text[],180,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'体の向き') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'肩・腰・足の向きが目標とズレて軌道が乱れる','スティックで平行を確認しスクエアに構える','2本のスティックでアライメント確認','構えの向きがズレています。目標に平行を確認する習慣が効きます。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'C. スイングの局面','テイクバックの始動不良',null,array['腕で上げる','インに引く','上げ方']::text[],190,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'腕と体の分離') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'腕でインに引き捻転できず軌道が乱れる','腕と体を同調させ股関節内側で肩を回す','両手クロス＋足踏みドリル','腕だけで上げると力が伝わりません。体と腕を一緒に動かしましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'C. スイングの局面','バックスイング軌道',null,array['インに引きすぎ','外に上げる','フラット']::text[],200,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'上げる方向') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'インに引きすぎ/フラットでトップが乱れる','グリップを体の正面に保ち縦の三角形で上げる','三角形同調ドリル','上げる方向が乱れています。正面で三角形を保つと整います。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'C. スイングの局面','トップの形',null,array['オーバースイング','クロス','突っ込み']::text[],210,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'コンパクトなトップ') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'オーバースイングで軸が乱れ切り返しが遅れる','左手遠くのトップでコンパクトに収める','トップで一旦止める間づくりドリル','トップが大きく乱れやすい状態です。コンパクトに収めると安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'C. スイングの局面','切り返しの上体先行',null,array['上から','突っ込み','被り']::text[],220,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'下半身始動') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'上体から切り返しアウトサイドインになる','切り返しで一瞬の間をつくり下半身から始動','8-4ドリル＋ウェイトシフト','体が先に開いています。下から動く順番でミスが減ります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'C. スイングの局面','ダウンスイング軌道',null,array['アウトサイドイン','カット','被る']::text[],230,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'インからの入射') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'外から下りてカット軌道・引っかけになる','下半身リードで内側からクラブを下ろす','ベタ足ドリルで下半身の先行を体感','外から下りています。内側から下ろす動きを作りましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'C. スイングの局面','インパクト不良',null,array['伸び上がり','緩む','手元浮く']::text[],240,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'正面インパクト') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'伸び上がり・上体が起きて打点が乱れる','前傾を保ち正面で脱力してリストターン','前傾維持ハーフスイング','当たる瞬間に体が起きています。前傾を保つと打点が安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'C. スイングの局面','フォロー・フィニッシュ',null,array['振り抜けない','止まる','バランス']::text[],250,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'振り抜き') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'体の回転が止まり手だけで終わる','フィニッシュまで胸を回し大きく振り抜く','連続素振りで大きなフィニッシュ','振り抜きが小さく力が逃げています。最後まで胸を回しましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'C. スイングの局面','リリース・タメ',null,array['早解け','アーリーリリース','キャスティング']::text[],260,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'タメの維持') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'早くほどけてヘッドが先行し力が逃げる','手元を支点にヘッドの重みでテコを使う','ハーフスイングでタメを感じる素振り','早くほどけてパワーが逃げています。ヘッドの重みを感じて振りましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'D. 体の使い方','捻転不足',null,array['回らない','浅い','手打ち','軸回転']::text[],270,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'腕引きのテイクバック') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'腕でインに引き軸回転できず捻転が浅い','腕と体を同調、股関節内側で左肩を回す','両手クロス＋足踏みドリル','腕だけで上げて体が回っていません。一緒に回す感覚を作りましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'D. 体の使い方','軸の不安定(スウェー)',null,array['右にずれる','突っ込み','スライド']::text[],280,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'その場の回転') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'右にスウェーし軸がずれて再現性が落ちる','狭めスタンスで右に流れずその場で捻転','ベタ足＋狭めスタンスの回転ドリル','体が右に流れています。その場で回るとミスが減ります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'D. 体の使い方','体重移動不足',null,array['乗らない','右足体重','踏み込み']::text[],290,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'左への踏み込み') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'右に残り最下点がずれてダフリ/プッシュに','切り返しで左へ踏み込み地面を使う','足踏み→ウェイトシフトドリル','左に乗り切れていません。踏み込みを入れると当たりが安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'D. 体の使い方','下半身が使えない',null,array['手打ち','上半身に頼る','地面反力']::text[],300,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'下半身リード') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'上半身主導でタイミングが合わない','下半身でリズムを取り腕は体と同調','ベタ足ドリルで下半身始動を体感','上半身に頼っています。下半身から動くと力が伝わります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'D. 体の使い方','腕と体の同調不足',null,array['バラバラ','三角形が崩れる','一体感']::text[],310,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'三角形キープ') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'腕と体が分離し軌道と当たりが乱れる','常にグリップを体の正面に保ち三角形で振る','三角形同調ドリル','腕と体がバラバラです。三角形を保つと安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'D. 体の使い方','手打ち・こねる',null,array['手先','リストを返す','小手先']::text[],320,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'体幹で振る') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'手先で操作しフェースが不安定','体幹の回転で振り、手はついてくるだけ','右手1本/左手1本の片手打ちドリル','手先で操作しすぎです。体で振ると再現性が上がります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'D. 体の使い方','リズム・テンポ',null,array['速い','間がない','タイミング']::text[],330,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'間をつくる') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'切り返しが速く上体が突っ込む','トップで一瞬の間をつくり一定のテンポで','メトロノーム的な連続素振り','リズムが速く突っ込んでいます。トップで間をつくりましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'D. 体の使い方','頭・軸の突っ込み',null,array['頭が動く','ビハインドザボール']::text[],340,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'頭の位置キープ') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'頭が目標方向へ流れ軸がぶれる','インパクトまで頭を残しビハインドザボール','頭を残す片手ドリル','頭が動いて軸がぶれています。頭を残すと当たりが安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'E. クラブ・状況別','ドライバーが安定しない',null,array['曲がる','飛ばない','ティーショット']::text[],350,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'払い打ち・入射') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'打ち込みすぎ・煽り打ちで曲がる','ティーアップを活かしアッパー気味に払う','ティー高一定の連続素振り','ドライバーは払い打ちが基本です。入射を整えると安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'E. クラブ・状況別','アイアンが安定しない',null,array['ダフる','方向','番手']::text[],360,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'ダウンブロー') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'すくい打ちで手前を叩く/薄く当たる','ハンドファーストでボール先の芝を取る','ライン上のティー/コインを取るドリル','アイアンは上から捉えます。ボールの先を取る意識で安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'E. クラブ・状況別','アプローチが寄らない',null,array['距離感','ザックリ','トップ','寄せ']::text[],370,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'基本の構えと支点') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'手首をこねてザックリ・トップが出る','ノーリストで振り子、ボールは左足踵基準','時計の針(7-5,8-4)で振り幅を作るドリル','手首を使いすぎています。振り子で距離感を作ると寄ります。','seed');
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,2,'上げ・転がしの選択') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'状況に合わない打ち方でミスが出る','基本は転がし、必要な時だけ上げる','キャリーとランの比率を決める練習','打ち方の選択がミスを生んでいます。転がし基本で確率を上げましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'E. クラブ・状況別','バンカーが出ない',null,array['砂','エクスプロージョン','苦手']::text[],380,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'開いて砂を取る') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'ヘッドを入れる位置と開きが不足','フェースを開きボール手前の砂を薄く取る','砂に線を引きその手前を打つドリル','砂の取り方が課題です。開いて手前の砂を取ると出やすくなります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'E. クラブ・状況別','パターが安定しない',null,array['方向','距離感','ストローク','3パット']::text[],390,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'ストロークの安定') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'手先で操作し方向・距離が乱れる','肩の振り子でフェースを目標に真っ直ぐ','ゲート(2ティー)を通すドリル','手先で操作しています。肩の振り子にすると方向が安定します。','seed');
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,2,'距離感') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'タッチが合わず3パットが増える','歩測と振り幅で距離をコントロール','3m/6m/9mの距離感ドリル','距離のタッチが課題です。振り幅で距離を作ると3パットが減ります。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'E. クラブ・状況別','ウェッジの距離が合わない',null,array['距離の打ち分け','50-100y']::text[],400,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'振り幅の基準化') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'毎回フルショットで距離が合わない','時計の針で振り幅を3段階に基準化','30/50/70yの振り幅ドリル','距離の基準がありません。振り幅を決めると打ち分けられます。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'E. クラブ・状況別','傾斜・ラフが苦手',null,array['つま先上下','左足上がり下がり','コース']::text[],410,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'傾斜なりの構え') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'平地と同じ構えでミスが出る','傾斜なりに立ち番手を上げてコンパクトに','左足上がり/下がりの素振り確認','傾斜への対応が課題です。傾斜なりに構えると安定します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'F. スコア・メンタル・体','コースでOB/大たたき',null,array['OB','曲げてはいけない','番手選択']::text[],420,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'ターゲット選択') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'ピンを狙いすぎ・リスクのある番手選択','大きなハザードを避け広いゾーンを狙う','各ホールで禁止エリアを先に決める','狙いすぎでOBが増えています。広い部分を狙うだけで改善します。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'F. スコア・メンタル・体','力み・緊張',null,array['力む','リラックスできない','1番ホール']::text[],430,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'脱力とリズム') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'力みでタイミングとタメが失われる','グリップ圧を弱め深呼吸、一定リズムで','ゆっくり大きい連続素振り','力みが出ています。握りを緩めてリズムを一定にしましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'F. スコア・メンタル・体','ラウンド後半の失速',null,array['崩れる','疲れ','集中']::text[],440,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'再現ルーティン') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'疲れで構え・リズムが崩れる','毎ショット同じルーティンで基準を保つ','プリショットルーティンの固定','後半の崩れはルーティンで防げます。毎回同じ手順を作りましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'F. スコア・メンタル・体','目標達成(100切り等)',null,array['100切り','90切り','スコアアップ']::text[],450,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'ミスの最小化') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'大たたきホールがスコアを崩す','OB/3パットを減らす戦略と番手選択','苦手ホールの攻め方を事前に決める','スコアは大たたきを減らすのが近道です。安全な選択を優先しましょう。','seed');

    insert into sc_symptoms(company_id,category,name,flight_dir,tags,sort_order,active,source)
      values (c.company_id,'F. スコア・メンタル・体','体の硬さ・痛み予防',null,array['可動域','柔軟','腰・肩の痛み']::text[],460,true,'seed') returning id into v_sym;
    insert into sc_checkpoints(company_id,symptom_id,priority,title)
      values (c.company_id,v_sym,1,'可動域に合う動き') returning id into v_cp;
    insert into sc_knowledge(company_id,checkpoint_id,cause,fix,drill,client_explanation,source)
      values (c.company_id,v_cp,'無理な捻転で痛み・再現性低下','可動域に合うトップとウォームアップ','肩甲骨・股関節のストレッチ','体に無理があります。可動域に合う振りにすると痛みも減ります。','seed');

  end loop;
end $$;
