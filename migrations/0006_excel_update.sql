-- ============================================================
-- Excelデータをもとに仕入先情報・supplier_rulesを更新
-- 2026-05-22
-- ============================================================

-- ① suppliers の notes / shipping_rule を更新（備考欄）
UPDATE suppliers SET
  notes = '2万5千円以内は送料別途',
  shipping_rule = '¥25,000以内送料別途'
WHERE id = 7; -- ワークス

UPDATE suppliers SET
  notes = NULL,
  shipping_rule = NULL
WHERE id = 8; -- アーチ

UPDATE suppliers SET
  notes = 'ログインid：s_furukawa@fine-d.co.jp / PASS：golfwinggd',
  shipping_rule = '¥20,000以上送料無料'
WHERE id = 2; -- グラファイトデザイン

UPDATE suppliers SET
  notes = NULL,
  shipping_rule = NULL
WHERE id = 9; -- CRAZY

UPDATE suppliers SET
  notes = '辻垣内社長：080-1027-7942 / 在庫確認：090-9118-3388 辻中様',
  shipping_rule = NULL
WHERE id = 10; -- シンカグラファイト（ループ）

UPDATE suppliers SET
  notes = '税込20,000未満 送料¥1,200',
  shipping_rule = '¥20,000未満 送料¥1,200'
WHERE id = 11; -- コンポジットテクノ

UPDATE suppliers SET
  notes = '¥30,000未満 送料¥1,500',
  shipping_rule = '¥30,000未満 送料¥1,500'
WHERE id = 12; -- TRPX

UPDATE suppliers SET
  notes = '手数料、送料別途',
  shipping_rule = '送料・手数料別途'
WHERE id = 13; -- REVE

UPDATE suppliers SET
  notes = 'y-yamamoto@olympic-co-ltd.jp / 在庫確認サイト: https://olympic-co-ltd.jp/golf/stock/g_login.php / ログイン:095428 / パスワード:095428',
  shipping_rule = NULL
WHERE id = 14; -- ラストストローク

UPDATE suppliers SET
  notes = '25,000以下は送料1,000円 / callcenter@asahigolf.co.jp',
  shipping_rule = '¥25,000以下 送料¥1,000'
WHERE id = 16; -- 朝日ゴルフ

UPDATE suppliers SET
  notes = '目川様 070-1278-3426 / masaaki_egawa@acushnetgolf.com / ボール担当：船橋様 080-7499-1691 / Atsunobu_Funahashi@acushnetgolf.com',
  shipping_rule = NULL
WHERE id = 17; -- アクシネットジャパン

UPDATE suppliers SET
  notes = NULL,
  shipping_rule = NULL
WHERE id = 18; -- プーマジャパン（COBRA）

UPDATE suppliers SET
  notes = NULL,
  shipping_rule = NULL
WHERE id = 19; -- ヤトゴルフ

UPDATE suppliers SET
  notes = '紙の注文票あり / ¥11,000未満送料別途',
  shipping_rule = '¥11,000未満送料別途'
WHERE id = 20; -- イオミック

UPDATE suppliers SET
  notes = '¥15,000以下送料別途',
  shipping_rule = '¥15,000以下送料別途'
WHERE id = 21; -- STM

UPDATE suppliers SET
  notes = '紙の注文票あり / 20,000円以下送料別途',
  shipping_rule = '¥20,000以下送料別途'
WHERE id = 22; -- 株式会社シンカグラファイト（グローブ）

-- エリートグリップ（新規登録）
INSERT OR IGNORE INTO suppliers (name, contact_name, order_method, payment_method, notes, shipping_rule, is_active)
VALUES ('エリートグリップ', NULL, 'LINE', NULL, '古川に連絡 / 20,000円未満送料別途', '¥20,000未満送料別途', 1);

-- ② supplier_rules の掛率をExcelの値に更新

-- フジクラ：DR/FW/UT=0.45, IRON=0.50（変更なし）
-- 三菱ケミカル：全0.45（変更なし）
-- USTマミヤ：全0.45（変更なし）
-- トライファス：全0.45（変更なし）
-- デザインチューニング：全0.50
UPDATE supplier_rules SET rate = 0.50 WHERE manufacturer IN ('デザインチューニング','デザインチューニング メビウス','デザインチューニング エッジ','デザインチューニング ゼロ');

-- ムジーク：DR=0.55 のみ（FW/UTはNull）
UPDATE supplier_rules SET rate = 0.55 WHERE manufacturer LIKE 'ムジーク%' AND club_type = 'DR';
UPDATE supplier_rules SET rate = NULL WHERE manufacturer LIKE 'ムジーク%' AND club_type IN ('FW','UT','IRON');

-- 日本シャフト：全0.51818182
UPDATE supplier_rules SET rate = 0.51818182 WHERE manufacturer IN ('日本シャフト','日本');

-- グラビティー：全0.60
UPDATE supplier_rules SET rate = 0.60 WHERE manufacturer LIKE 'グラビティー%' OR manufacturer LIKE 'Waccine%';

-- アーチ：DR/FW/UT=0.50
UPDATE supplier_rules SET rate = 0.50 WHERE manufacturer IN ('ARCH','Arch','Arch/ARCH','アーチ');

-- グラファイトデザイン：DR/FW/UT=0.45
UPDATE supplier_rules SET rate = 0.45 WHERE manufacturer = 'グラファイトデザイン';

-- CRAZY：DR=0.40, FW/UT=0.50（変更なし）

-- ループ（シンカグラファイト）：DR/FW/UT=0.55
UPDATE supplier_rules SET rate = 0.55 WHERE manufacturer IN ('シンカグラファイト','ループ');

-- コンポジットテクノ：DR/FW/UT=0.45（変更なし）

-- TRPX：DR/FW/UT=0.50（変更なし）

-- REVE：DR/FW/UT=0.65（変更なし）

-- オリンピック（オリムピック）：DR/FW/UT=0.50
UPDATE supplier_rules SET rate = 0.50 WHERE manufacturer IN ('オリムピック','オリンピック');

-- ③ ループのメーカー表記「ループ」をsupplier_rulesに追加
INSERT OR IGNORE INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes)
SELECT 'シャフト', 'ループ', club_type, supplier_id, 0.55, priority, 'ループ → シンカグラファイト（ループ）'
FROM supplier_rules WHERE manufacturer = 'シンカグラファイト' AND club_type IS NOT NULL
ON CONFLICT DO NOTHING;

-- ④ エリートグリップをsupplier_rulesに追加
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes)
SELECT 'グリップ', 'エリート', NULL,
  (SELECT id FROM suppliers WHERE name='エリートグリップ' LIMIT 1),
  NULL, 10, 'エリート → エリートグリップ'
WHERE NOT EXISTS (SELECT 1 FROM supplier_rules WHERE manufacturer='エリート');

