-- ============================================================
-- ワークス経由メーカーのルール修正・追加
-- 対象: フジクラ / 日本シャフト / 三菱ケミカル / USTマミヤ /
--       トライファス / ムジーク / デザインチューニング / グラビティー
-- ワークス supplier_id = 7
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ① フジクラ → ワークス に変更（全種類）
DELETE FROM supplier_rules WHERE manufacturer = 'フジクラ';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'フジクラ', 'DR',   7, 0.45, 10, 'フジクラ DR → ワークス'),
('シャフト', 'フジクラ', 'FW',   7, 0.45, 10, 'フジクラ FW → ワークス'),
('シャフト', 'フジクラ', 'UT',   7, 0.45, 10, 'フジクラ UT → ワークス'),
('シャフト', 'フジクラ', 'IRON', 7, 0.50, 10, 'フジクラ IR → ワークス');

-- ② 日本シャフト → ワークス に変更（全種類・表記揺れ含む）
DELETE FROM supplier_rules WHERE manufacturer IN ('日本シャフト', '日本');
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', '日本シャフト', 'DR',   7, 0.518, 10, '日本シャフト DR → ワークス'),
('シャフト', '日本シャフト', 'FW',   7, 0.518, 10, '日本シャフト FW → ワークス'),
('シャフト', '日本シャフト', 'UT',   7, 0.518, 10, '日本シャフト UT → ワークス'),
('シャフト', '日本シャフト', 'IRON', 7, 0.518, 10, '日本シャフト IR → ワークス'),
('シャフト', '日本',         'DR',   7, 0.518, 10, '日本シャフト DR → ワークス（短縮）'),
('シャフト', '日本',         'FW',   7, 0.518, 10, '日本シャフト FW → ワークス（短縮）'),
('シャフト', '日本',         'UT',   7, 0.518, 10, '日本シャフト UT → ワークス（短縮）'),
('シャフト', '日本',         'IRON', 7, 0.518, 10, '日本シャフト IR → ワークス（短縮）');

-- ③ 三菱ケミカル → ワークス に変更（全種類・表記揺れ含む）
DELETE FROM supplier_rules WHERE manufacturer IN ('三菱ケミカル', '三菱');
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', '三菱ケミカル', 'DR',   7, 0.45, 10, '三菱ケミカル DR → ワークス'),
('シャフト', '三菱ケミカル', 'FW',   7, 0.45, 10, '三菱ケミカル FW → ワークス'),
('シャフト', '三菱ケミカル', 'UT',   7, 0.45, 10, '三菱ケミカル UT → ワークス'),
('シャフト', '三菱ケミカル', 'IRON', 7, 0.45, 10, '三菱ケミカル IR → ワークス'),
('シャフト', '三菱',         'DR',   7, 0.45, 10, '三菱ケミカル DR → ワークス（短縮）'),
('シャフト', '三菱',         'FW',   7, 0.45, 10, '三菱ケミカル FW → ワークス（短縮）'),
('シャフト', '三菱',         'UT',   7, 0.45, 10, '三菱ケミカル UT → ワークス（短縮）'),
('シャフト', '三菱',         'IRON', 7, 0.45, 10, '三菱ケミカル IR → ワークス（短縮）');

-- ④ USTマミヤ → ワークス に変更（全表記揺れ）
DELETE FROM supplier_rules WHERE manufacturer IN ('UST', 'UST Mamiya', 'UST マミヤ', 'USTマミヤ', 'マミヤ・オーピー');
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'UST Mamiya', 'DR',   7, 0.45, 10, 'UST Mamiya DR → ワークス'),
('シャフト', 'UST Mamiya', 'FW',   7, 0.45, 10, 'UST Mamiya FW → ワークス'),
('シャフト', 'UST Mamiya', 'UT',   7, 0.45, 10, 'UST Mamiya UT → ワークス'),
('シャフト', 'UST Mamiya', 'IRON', 7, 0.45, 10, 'UST Mamiya IR → ワークス'),
('シャフト', 'USTマミヤ',   'DR',   7, 0.45, 10, 'USTマミヤ DR → ワークス'),
('シャフト', 'USTマミヤ',   'FW',   7, 0.45, 10, 'USTマミヤ FW → ワークス'),
('シャフト', 'USTマミヤ',   'UT',   7, 0.45, 10, 'USTマミヤ UT → ワークス'),
('シャフト', 'USTマミヤ',   'IRON', 7, 0.45, 10, 'USTマミヤ IR → ワークス'),
('シャフト', 'UST',         'DR',   7, 0.45, 10, 'UST DR → ワークス'),
('シャフト', 'UST',         'FW',   7, 0.45, 10, 'UST FW → ワークス'),
('シャフト', 'UST',         'UT',   7, 0.45, 10, 'UST UT → ワークス'),
('シャフト', 'UST',         'IRON', 7, 0.45, 10, 'UST IR → ワークス'),
('シャフト', 'マミヤ・オーピー', 'DR',   7, 0.45, 10, 'マミヤ DR → ワークス'),
('シャフト', 'マミヤ・オーピー', 'FW',   7, 0.45, 10, 'マミヤ FW → ワークス'),
('シャフト', 'マミヤ・オーピー', 'UT',   7, 0.45, 10, 'マミヤ UT → ワークス'),
('シャフト', 'マミヤ・オーピー', 'IRON', 7, 0.45, 10, 'マミヤ IR → ワークス');

-- ⑤ トライファス → ワークス（既存を念のり再設定）
DELETE FROM supplier_rules WHERE manufacturer = 'トライファス';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'トライファス', 'DR',   7, 0.45, 10, 'トライファス DR → ワークス'),
('シャフト', 'トライファス', 'FW',   7, 0.45, 10, 'トライファス FW → ワークス'),
('シャフト', 'トライファス', 'UT',   7, 0.45, 10, 'トライファス UT → ワークス'),
('シャフト', 'トライファス', 'IRON', 7, 0.45, 10, 'トライファス IR → ワークス');

-- ⑥ ムジーク（各シリーズ）→ ワークス（新規追加）
DELETE FROM supplier_rules WHERE manufacturer LIKE 'ムジーク%';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'ムジーク',             'DR',   7, NULL, 10, 'ムジーク DR → ワークス'),
('シャフト', 'ムジーク',             'FW',   7, NULL, 10, 'ムジーク FW → ワークス'),
('シャフト', 'ムジーク',             'UT',   7, NULL, 10, 'ムジーク UT → ワークス'),
('シャフト', 'ムジーク',             'IRON', 7, NULL, 10, 'ムジーク IR → ワークス'),
('シャフト', 'ムジーク バンブー',     'DR',   7, NULL, 10, 'ムジーク バンブー DR → ワークス'),
('シャフト', 'ムジーク バンブー',     'FW',   7, NULL, 10, 'ムジーク バンブー FW → ワークス'),
('シャフト', 'ムジーク バンブー',     'UT',   7, NULL, 10, 'ムジーク バンブー UT → ワークス'),
('シャフト', 'ムジーク ドガッティ',   'DR',   7, NULL, 10, 'ムジーク ドガッティ DR → ワークス'),
('シャフト', 'ムジーク ドガッティ',   'FW',   7, NULL, 10, 'ムジーク ドガッティ FW → ワークス'),
('シャフト', 'ムジーク ドガッティ',   'UT',   7, NULL, 10, 'ムジーク ドガッティ UT → ワークス'),
('シャフト', 'ムジーク ターフライダー','DR',   7, NULL, 10, 'ムジーク ターフライダー DR → ワークス'),
('シャフト', 'ムジーク ターフライダー','FW',   7, NULL, 10, 'ムジーク ターフライダー FW → ワークス'),
('シャフト', 'ムジーク ターフライダー','UT',   7, NULL, 10, 'ムジーク ターフライダー UT → ワークス');

-- ⑦ デザインチューニング（各シリーズ）→ ワークス（新規追加）
DELETE FROM supplier_rules WHERE manufacturer LIKE 'デザインチューニング%';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'デザインチューニング',          'DR',   7, NULL, 10, 'DT DR → ワークス'),
('シャフト', 'デザインチューニング',          'FW',   7, NULL, 10, 'DT FW → ワークス'),
('シャフト', 'デザインチューニング',          'UT',   7, NULL, 10, 'DT UT → ワークス'),
('シャフト', 'デザインチューニング',          'IRON', 7, NULL, 10, 'DT IR → ワークス'),
('シャフト', 'デザインチューニング メビウス', 'DR',   7, NULL, 10, 'DT メビウス DR → ワークス'),
('シャフト', 'デザインチューニング メビウス', 'FW',   7, NULL, 10, 'DT メビウス FW → ワークス'),
('シャフト', 'デザインチューニング メビウス', 'UT',   7, NULL, 10, 'DT メビウス UT → ワークス'),
('シャフト', 'デザインチューニング エッジ',   'DR',   7, NULL, 10, 'DT エッジ DR → ワークス'),
('シャフト', 'デザインチューニング エッジ',   'FW',   7, NULL, 10, 'DT エッジ FW → ワークス'),
('シャフト', 'デザインチューニング エッジ',   'UT',   7, NULL, 10, 'DT エッジ UT → ワークス'),
('シャフト', 'デザインチューニング ゼロ',     'DR',   7, NULL, 10, 'DT ゼロ DR → ワークス'),
('シャフト', 'デザインチューニング ゼロ',     'FW',   7, NULL, 10, 'DT ゼロ FW → ワークス'),
('シャフト', 'デザインチューニング ゼロ',     'UT',   7, NULL, 10, 'DT ゼロ UT → ワークス');

-- ⑧ グラビティー（Waccine Compo）→ ワークス（新規追加）
DELETE FROM supplier_rules WHERE manufacturer LIKE 'グラビティー%' OR manufacturer LIKE 'Waccine%';
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'グラビティー',              'DR',   7, NULL, 10, 'グラビティー DR → ワークス'),
('シャフト', 'グラビティー',              'FW',   7, NULL, 10, 'グラビティー FW → ワークス'),
('シャフト', 'グラビティー',              'UT',   7, NULL, 10, 'グラビティー UT → ワークス'),
('シャフト', 'グラビティー',              'IRON', 7, NULL, 10, 'グラビティー IR → ワークス'),
('シャフト', 'Waccine Compo',            'DR',   7, NULL, 10, 'Waccine DR → ワークス'),
('シャフト', 'Waccine Compo',            'FW',   7, NULL, 10, 'Waccine FW → ワークス'),
('シャフト', 'Waccine Compo',            'UT',   7, NULL, 10, 'Waccine UT → ワークス'),
('シャフト', 'Waccine Compo',            'IRON', 7, NULL, 10, 'Waccine IR → ワークス'),
('シャフト', 'グラビティー（Waccine Compo）', 'DR',   7, NULL, 10, 'グラビティー DR → ワークス'),
('シャフト', 'グラビティー（Waccine Compo）', 'FW',   7, NULL, 10, 'グラビティー FW → ワークス'),
('シャフト', 'グラビティー（Waccine Compo）', 'UT',   7, NULL, 10, 'グラビティー UT → ワークス'),
('シャフト', 'グラビティー（Waccine Compo）', 'IRON', 7, NULL, 10, 'グラビティー IR → ワークス');

PRAGMA foreign_keys = ON;
