-- 202606_ゴルフウィング在庫リスト.xlsm からの移行（DECISIONS #96 / 生成: scripts/inventory/excel-to-inv.py）
-- 数量は原本と完全一致。再実行しても増えない（on conflict / 差分UPDATE）

insert into inv_items (company_id,store_id,code,category,maker,name,spec,variant,unit,location1,location2,notes,list_price,cost_price)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7','82bb4e18-427d-4cc7-a834-c9e2a9b18199',v.code,cat.name,mk.name,v.name,v.spec,v.variant,
  (array['個','本','枚','ダース','箱'])[v.u], case when v.l>0 then (array['グリップホルダーに陳列','バックヤード','ヘッド陳列棚','受付に陳列','受付カウンター','受付カウンター下','受付陳列','工房上の棚（段ボール箱内）','工房内左の白い箱','店舗入り口','流し台後ろの棚'])[v.l] end, v.location2, v.notes, v.list_price, v.cost_price
from (values
('DRC-TM-001','SIM DR flex SR',null,null,1,2,null,null,78000,46800),
('DRC-CA-001','Ai SMOKE ♦♦♦ 9°',null,null,1,2,null,null,88000,52800),
('DRC-CA-002','Ai SMOKE ♦♦♦ 10.5°',null,null,1,2,null,null,88000,52800),
('DRH-EV-001','BALDO JUNIOR',null,null,1,3,null,null,80000,48000),
('DRH-EV-002','2023 568 COMPETIZIONE DRIVER ディープ 9°',null,null,1,3,'棚下収納にもあり',null,80000,48000),
('DRH-EV-003','2023 568 COMPETIZIONE DRIVER ディープ 9.5°',null,null,1,3,'棚下収納にもあり',null,70000,25200),
('DRH-EV-004','2023 568 COMPETIZIONE DRIVER ディープ 10°',null,null,1,3,'棚下収納にもあり',null,70000,42000),
('DRH-EV-005','2023 568 COMPETIZIONE DRIVER ディープ 10.5°',null,null,1,3,'棚下収納にもあり',null,70000,42000),
('DRH-EV-006','2023 568 COMPETIZIONE DRIVER シャロー9°',null,null,1,3,null,null,70000,42000),
('DRH-EV-007','2023 568 COMPETIZIONE DRIVER シャロー9.5°',null,null,1,3,'棚下収納にもあり',null,70000,42000),
('DRH-EV-008','2023 568 COMPETIZIONE DRIVER シャロー10°',null,null,1,3,'棚下収納にもあり',null,70000,42000),
('DRH-EV-009','2023 568 COMPETIZIONE DRIVER シャロー10.5°',null,null,1,3,'棚下収納にもあり',null,70000,42000),
('DRH-EV-010','2024 TT DRIVER GT1 420 9°',null,null,1,3,'棚下収納にもあり',null,70000,42000),
('DRH-EV-011','2024 TT DRIVER GT1 420 10°',null,null,1,3,'棚下収納にもあり',null,70000,42000),
('DRH-EV-012','2024 TT DRIVER GT2 ディープ 9°',null,null,1,3,'棚下収納にもあり',null,80000,48000),
('DRH-EV-013','2024 TT DRIVER GT2 ディープ 10°',null,null,1,3,'棚下収納にもあり',null,80000,48000),
('DRH-EV-014','2024 TT DRIVER GT3 シャロー9°',null,null,1,3,'棚下収納にもあり',null,80000,48000),
('DRH-CO-001','AEROJET 9°',null,null,1,6,null,null,80000,48000),
('DRH-CO-002','AEROJET 10.5°',null,null,1,3,'受付カウンター下',null,80000,48000),
('DRH-CO-003','AEROJET LS 10.5°',null,null,1,3,'受付カウンター下',null,65000,39000),
('DRH-CO-004','AEROJET MAX 10.5°',null,null,1,6,null,null,65000,41250),
('DRH-CO-005','DARKSPEED X 9.0°',null,null,1,0,null,null,65000,41250),
('DRH-CO-006','DARKSPEED X 10.5°',null,null,1,0,null,null,65000,48000),
('DRH-CO-007','DARKSPEED LS 9.0°',null,null,1,0,null,null,65000,34500),
('DRH-CO-008','DARKSPEED MAX 9.0°',null,null,1,0,null,null,65000,34500),
('DRH-CO-009','DARKSPEED MAX 12.0°',null,null,1,0,null,null,65000,34500),
('DRH-CO-010','DARKSPEED WOMENS 12.0°',null,null,1,0,null,null,65000,34500),
('DRH-CO-011','DS-ADAPT LS 9.0°',null,null,1,0,null,null,65000,34500),
('DRH-CO-012','DR DS-ADAPT X 10.5°',null,null,1,0,null,null,65000,34500),
('DRH-CO-013','DR DS-ADAPT MAX K 10.5°',null,null,1,0,null,null,65000,34500),
('DRH-CO-014','DR DS-ADAPT MAX D 10.5°',null,null,1,0,null,null,65000,34500),
('DRH-NA-001','CRAZY',null,null,1,3,'棚下収納にもあり',null,55000,48000),
('DRH-WA-001','BANG 10°',null,null,1,8,null,null,80000,48000),
('DRH-WA-002','BANG 11°',null,null,1,8,null,null,80000,48000),
('DRH-CO-015','OPTM MAX-K Driver 10.5°',null,null,1,0,null,null,null,null),
('DRH-CO-016','OPTM LS Driver 9.0°',null,null,1,0,null,null,null,null),
('FWC-TM-001','STEALTH 3W TM50S',null,null,1,0,null,null,42000,26460),
('FWH-EV-001','BALDO CORSA　BRASSY',null,null,1,6,null,null,65000,39000),
('FWH-CO-001','AEROJET MAX 15.5°(3w)',null,null,1,3,null,null,33000,16500),
('FWH-CO-002','AEROJET LS 14.5°(3w)',null,null,1,3,null,null,33000,16500),
('FWH-CO-003','AEROJET LS 17.5°(5w)',null,null,1,6,null,null,33000,16500),
('FWH-CO-004','DARKSPEED X 15.0° (3w)',null,null,1,0,null,null,33000,21000),
('FWH-CO-005','DARKSPEED X 18.0° (5w)',null,null,1,0,null,null,33000,21000),
('FWH-CO-006','FW DS-ADAPT X 15.0° (3w)',null,null,1,0,null,null,33000,21000),
('FWH-CO-007','FW DS-ADAPT X 18.0° (5w)',null,null,1,0,null,null,33000,21000),
('UTH-EV-001','2022 CORSA UT 17°',null,null,1,6,null,null,50000,30000),
('UTH-EV-002','2022 CORSA UT 20°',null,null,1,3,null,null,50000,30000),
('UTH-EV-003','2022 CORSA UT 23°',null,null,1,11,null,null,50000,30000),
('WDH-EV-001','2022 CORSA WEDGE　TOUR　RAW　50°',null,null,1,6,null,null,21000,12600),
('WDH-EV-002','2022 CORSA WEDGE　TOUR　RAW　52°',null,null,1,6,null,null,21000,12600),
('WDH-EV-003','2022 CORSA WEDGE　TOUR　RAW　56°',null,null,1,6,null,null,21000,12600),
('WDH-EV-004','2022 CORSA WEDGE　TOUR　RAW　58°',null,null,1,6,null,null,21000,12600),
('HC-CO-001','AEROJET DR',null,null,1,2,null,null,0,0),
('HC-CO-002','AEROJET FW',null,null,1,2,null,null,0,0),
('HC-CO-003','DARKSPEED DR',null,null,1,0,null,null,0,0),
('HC-CO-004','DARKSPEED FW',null,null,1,0,null,null,0,0),
('HC-CO-005','DS-ADAPT DR',null,null,1,0,null,null,0,0),
('HC-CO-006','DS-ADAPT FW',null,null,1,0,null,null,0,0),
('HC-EV-001','BALDO BLASSY',null,null,1,2,null,null,3800,2280),
('HC-EV-002','BAKDO 2022 白黒UT',null,'白黒',1,2,null,null,2800,1680),
('HC-EV-003','BALDO　黒黒UT',null,'黒黒',1,2,null,null,2800,1680),
('HC-EV-004','BALDO　FW',null,null,1,2,null,null,3000,1800),
('HC-WA-001','BANG',null,null,1,8,null,null,0,0),
('HC-MX-001','ワゴンセール用',null,null,1,2,null,null,0,0),
('WR-WA-001','レンチ',null,null,1,8,null,null,0,0),
('WR-CO-001','レンチ',null,null,1,2,null,null,0,0),
('BL-AC-001','2023 PROV1',null,'ホワイト',4,7,'ヘッド棚の下',null,5500,4872),
('BL-AC-002','2023 PROV1X',null,'ホワイト',4,7,'ヘッド棚の下',null,5500,4872),
('BL-AC-003','2025 PROV1',null,'ホワイト',4,7,'ヘッド棚の下',null,5700,5024),
('BL-AC-004','2025 PROV1X',null,'ホワイト',4,7,'ヘッド棚の下',null,5700,5024),
('BL-AC-005','新 PROV1',null,'ホワイト',4,7,'ヘッド棚の下',null,null,null),
('BL-AC-006','新 PROV1X',null,'ホワイト',4,7,'ヘッド棚の下',null,null,null),
('BL-AC-007','VELOCITY',null,'ホワイト',4,7,'ヘッド棚の下',null,3200,2400),
('BL-AC-008','VELOCITY',null,'グリーン',4,7,'ヘッド棚の下',null,3200,2400),
('BL-AC-009','旧 TOURSOFT',null,'ホワイト',4,7,'ヘッド棚の下',null,4000,3000),
('BL-AC-010','旧 TOURSOFT',null,'イエロー',4,7,'ヘッド棚の下',null,4000,3000),
('BL-AC-011','新 TOURSOFT',null,'ホワイト',4,7,'ヘッド棚の下',null,null,null),
('BL-AC-012','新 TOURSOFT',null,'イエロー',4,7,'ヘッド棚の下',null,null,null),
('BL-AC-013','TOURSOFT　AIM',null,null,1,0,null,null,null,null),
('BL-AC-014','旧 LEFTDASH',null,'ホワイト',4,7,'ヘッド棚の下',null,5500,4872),
('BL-AC-015','新 LEFTDASH',null,'ホワイト',4,7,'ヘッド棚の下',null,null,null),
('BL-BS-001','TourBX（白）',null,'ホワイト',4,7,'ヘッド棚の下',null,6300,4725),
('BL-BS-002','TourBX（黄）',null,'イエロー',4,7,'ヘッド棚の下',null,6300,4725),
('BL-BS-003','TourBXS（白）',null,'ホワイト',4,7,'ヘッド棚の下',null,6300,4725),
('BL-BS-004','TourBXS（黄）',null,'イエロー',4,7,'ヘッド棚の下',null,6300,4725),
('BL-BS-005','JGRボール',null,'パールピンク',4,7,'ヘッド棚の下',null,5800,4300),
('BL-BS-006','JGRボール',null,'イエロー',4,7,'ヘッド棚の下',null,null,null),
('BL-DL-001','2023 SRIXON ZSTAR',null,'ホワイト',4,7,'ヘッド棚の下',null,5700,4725),
('BL-DL-002','2023 SRIXON ZSTAR',null,'イエロー',4,7,'ヘッド棚の下',null,5700,4725),
('BL-DL-003','2023 SRIXON ZSTAR XV',null,'ホワイト',4,7,'ヘッド棚の下',null,5700,4725),
('BL-DL-004','2023 SRIXON ZSTAR ◇',null,'ホワイト',4,7,'ヘッド棚の下',null,5700,4725),
('SF-SG-001','LOOP BW R',null,null,2,2,null,null,60000,33000),
('SF-SG-002','SLASH TYPE-R 5S',null,null,1,0,null,null,68000,37400),
('SF-SG-003','SLASH TYPE-B 5S',null,null,1,0,null,null,68000,37400),
('SF-DT-001','ZERO　40Ｒ',null,null,2,2,null,null,80000,40000),
('SF-DT-002','ZERO　60Ｓ',null,null,2,2,null,null,80000,40000),
('SF-DT-003','ZERO XROSS　60S',null,null,2,2,null,null,80000,40000),
('SF-DT-004','ZERO SOLID 40 S',null,null,2,2,null,null,90000,45000),
('SF-DT-005','ZERO SOLID 50 S',null,null,2,2,null,null,90000,45000),
('SF-DT-006','ZERO SOLID 60 S',null,null,2,2,null,null,90000,45000),
('SF-OL-001','03β-49D　Premium',null,null,2,2,null,null,60000,30000),
('SF-CT-001','ファイヤーアイアン',null,null,2,2,null,null,0,0),
('SL-WK-001','テーラーメイド　DR／FWスリーブ',null,null,1,2,null,null,5000,2600),
('SL-WK-002','テーラーメイド　ＵＴスリーブ',null,null,1,0,null,null,null,null),
('SL-WK-003','タイトリスト　DR／FWスリーブ',null,null,1,2,null,null,5000,2450),
('SL-WK-004','PING G400 DR/FW スリーブ',null,null,1,2,null,null,null,2800),
('SL-WK-005','PING G410 　DR/FW スリーブ',null,null,1,2,null,null,5000,2600),
('SL-WK-006','PING G430 　DR/FW スリーブ',null,null,1,2,null,null,null,null),
('SL-WK-007','PING G440 　DR/FW スリーブ',null,null,1,2,null,null,null,null),
('SL-WK-008','PING　UT スリーブ',null,null,1,2,null,null,2800,2250),
('SL-CO-001','DR/FW COBRA　スリーブ（旧モデル）',null,null,1,0,null,null,0,0),
('SL-CO-002','DR/FW COBRA　スリーブ（新モデル）',null,null,1,2,'付属品',null,0,0),
('SL-WK-009','キャロウェイDR/FW　スリーブ',null,null,1,2,null,null,5000,4800),
('SL-WK-010','キャロウェイ　FW　スリーブ',null,null,1,0,null,null,4000,2450),
('SL-MZ-001','ミズノ　ＤＲ　スリーブ',null,null,1,0,null,null,3000,2100),
('SL-EV-001','BALDO　 DR スリーブ',null,null,1,2,null,null,4000,2400),
('SL-WA-001','WAWOO DR スリーブ',null,null,1,0,null,null,3000,1800),
('SL-EB-001','(DR)BAHAMA',null,null,1,2,null,null,0,0),
('WT-CO-001','コブラ　AEROJET　3g　（青）',null,null,1,0,null,null,0,0),
('WT-CO-002','コブラ　AEROJET　8g　（青）',null,null,1,2,null,null,0,0),
('WT-CO-003','コブラ　AEROJET　12g　（青）',null,null,1,2,null,null,0,0),
('WT-CO-004','コブラ　AEROJET　16g　（青）',null,null,1,2,null,null,0,0),
('WT-CO-005','コブラ　DARKSPED  3g  （黒）',null,null,1,0,null,null,0,0),
('WT-CO-006','コブラ　DARKSPED  8g  （黒）',null,null,1,2,null,null,0,0),
('WT-CO-007','コブラ　DARKSPED  12g  （黒）',null,null,1,2,null,null,0,0),
('WT-CO-008','コブラ　DARKSPED  16g  （黒）',null,null,1,2,null,null,0,0),
('GC-HL-001','W',null,null,3,9,null,null,4000,700),
('GC-HL-002','SH',null,null,3,9,null,null,3000,1100),
('GR-IO-001','Sticky Evolution　2.3　ﾌﾞﾙｰ (有)',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-002','Sticky Evolution　2.3　ﾌﾞﾙｰ (無)',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-003','Sticky Evolution　2.3　ｺｰﾗﾙﾚｯﾄﾞ (有)',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-004','Sticky Evolution　2.3　ｺｰﾗﾙﾚｯﾄﾞ (無)',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-005','Sticky Evolution　2.3　ﾚﾓﾝｲｴﾛｰ (有)',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-006','Sticky Evolution　2.3　ﾚﾓﾝｲｴﾛｰ (無)',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-007','Sticky Evolution　2.3　ブラック（有）',null,null,2,1,'ヘッド棚下',null,null,null),
('GR-IO-008','Sticky Evolution　2.3　ブラック（無）',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-009','Sticky Evolution　1.8　ﾌﾞﾙｰ (有)',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-010','Sticky Evolution　1.8　ﾌﾞﾙｰ (無)',null,null,2,1,'ヘッド棚下',null,1300,754),
('GR-IO-011','iX touch　2.0　ﾌﾞﾗｯｸ×ｵﾚﾝｼﾞ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-012','iX touch　2.0　ﾌﾞﾗｯｸ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-013','iX touch　2.0　ｽｶｲﾌﾞﾙｰ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-014','iX touch　2.0　ｼﾙﾊﾞｰ (有)',null,null,2,1,null,null,null,null),
('GR-IO-015','iX touch　2.0　ｼﾙﾊﾞｰ (無)',null,null,2,1,'発注中',null,null,null),
('GR-IO-016','Sticky Super Ultra Light　27g　ﾌﾞﾗｯｸ (有)',null,null,2,1,null,null,1900,1102),
('GR-IO-017','iX touch　2.0　ﾌﾞﾗｯｸ×ｽｶｲﾌﾞﾙｰ (無)',null,null,2,1,null,null,1700,986),
('GR-IO-018','Sticky 2.3 soft プラチナムグレー （有）',null,null,2,1,null,null,1700,986),
('GR-IO-019','iXx cord 2.3 ﾌﾞﾗｯｸ×ﾌﾞﾙｰ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-020','iXx cord 2.3 ﾌﾞﾗｯｸ×ﾌﾞﾙｰ (無)',null,null,2,1,null,null,1700,986),
('GR-IO-021','X-EVOLUTION　2.3　ブルー (有)',null,null,2,1,null,null,1900,1102),
('GR-IO-022','X-EVOLUTION　2.3　ブルー (無)',null,null,2,1,null,null,1900,1102),
('GR-IO-023','X-EVOLUTION　2.3　レッドﾞ (有)',null,null,2,1,null,null,1900,1102),
('GR-IO-024','X-EVOLUTION　2.3　レッド (無)',null,null,2,1,null,null,1900,1102),
('GR-IO-025','X-EVOLUTION　2.3　レモンイエロー(有)',null,null,2,1,null,null,1900,1102),
('GR-IO-026','X-EVOLUTION　2.3　レモンイエロー(無)',null,null,2,1,null,null,1900,1102),
('GR-IO-027','Sticky Ultra Light　1.0　ﾐﾙｷｰﾋﾟﾝｸ (有)',null,null,2,1,null,null,1900,1102),
('GR-IO-028','Sticky Ultra Light　1.0　ﾌﾞﾗｯｸ (有)',null,null,2,1,null,null,1900,1102),
('GR-IO-029','Sticky SUPER LIGHT 1.8(有) ブルー',null,null,2,1,'ヘッド棚下',null,1900,950),
('GR-IO-030','Sticky SUPER LIGHT 1.8(有) ブラック',null,null,2,1,'ヘッド棚下',null,1900,1102),
('GR-IO-031','Sticky SUPER LIGHT 1.8(無) ブラック',null,null,1,0,null,null,1900,1102),
('GR-IO-032','Sticky Lady‘ｓ　18.7　ﾐﾙｷｰﾋﾟﾝｸ (有)',null,null,2,1,null,null,1500,870),
('GR-IO-033','Moebius Black　1.8　ﾌﾞﾗｯｸ×ﾋﾟﾝｸ (無)',null,null,2,1,null,null,1900,1102),
('GR-IO-034','Sticky 2.3 (Standard)　ブラック（有）',null,null,2,1,null,null,null,null),
('GR-IO-035','Sticky 2.3 (Standard)　ブラック（無）',null,null,2,1,null,null,null,null),
('GR-IO-036','MIMIC　1.5　ﾋﾞﾋﾞｯﾄﾋﾟﾝｸ×ﾎﾜｲﾄ(有)',null,null,2,1,'ヘッド棚下',null,1700,986),
('GR-IO-037','MIMIC　1.5　ﾎﾜｲﾄ×ﾋﾟﾝｸ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-038','MIMIC　1.5　ｺｰﾗﾙﾚｯﾄﾞ×ﾎﾜｲﾄ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-039','MIMIC　1.5　ﾚﾓﾝｲｴﾛｰ×ﾋﾟﾝｸ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-040','Sticky Opus Lady‘ｓ　1.0　ﾐﾝﾄｸﾞﾘｰﾝ×ﾎﾜｲﾄ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-041','Sticky Opus Lady‘ｓ　1.0　ﾗﾍﾞﾝﾀﾞｰ×ﾎﾜｲﾄ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-042','LTC  iXx　1.8　ｺｰﾗﾙﾚｯﾄﾞ (無)',null,null,2,1,null,null,1700,986),
('GR-IO-043','LTC  iXx　1.8　ｺｰﾗﾙﾚｯﾄﾞ (有)',null,null,2,1,null,null,1700,986),
('GR-IO-044','LTC  iXx　1.8　ライトブルー (有)',null,null,2,0,null,null,1700,986),
('GR-IO-045','LTC  iXx　2.3　ﾌﾞﾗｯｸ×ﾌﾞﾗｯｸ (有)',null,null,2,0,null,null,1700,986),
('GR-IO-046','LTC  iXx　2.3　ﾌﾞﾗｯｸ×ﾌﾞﾗｯｸ (無)',null,null,2,0,null,null,null,null),
('GR-IO-047','Sticky 2.3 soft ブラック （有）',null,null,2,0,null,null,1700,986),
('GR-IO-048','Sticky Super Ultra Light　27g　ﾌﾞﾗｯｸ (有)',null,null,2,0,null,null,1900,1102),
('GR-IO-049','X-GRIP　2.3　2023 松山英樹モデル ｽｶｲﾌﾞﾙｰ (無)',null,null,5,5,null,null,19500,11310),
('GR-IO-050','20周年記念 ix touch 2.0  有',null,null,1,0,null,null,1400,812),
('GR-LF-001','LIFATH INNOV M60 BLACK',null,null,2,1,'ヘッド棚下',null,1400,700),
('GR-CD-001','CADERO 2×2 PENTAGON ｽﾀｰ入り　ﾎﾜｲﾄ×ﾌﾞﾙｰ(有)',null,null,2,1,null,null,2500,1250),
('GR-CD-002','CADERO 2×2 PENTAGON ｽﾀｰ入り　ﾎﾜｲﾄ×ﾚｯﾄﾞ(有)',null,null,2,1,null,null,2500,1250),
('GR-CD-003','CADERO 2×2 PENTAGON ｽﾀｰ入り　ﾌﾞﾗｯｸ×ﾚｯﾄﾞ(有)',null,null,2,1,null,null,2500,1250),
('GR-CD-004','CADERO 2×2 PENTAGON ｽﾀｰ入り　ﾌﾞﾗｯｸ×ｼﾙﾊﾞｰ(有)',null,null,2,1,null,null,2500,1250),
('GR-ST-001','S-1 Black/Orange(無)',null,null,2,1,null,null,null,null),
('GR-ST-002','S-1 Light black×berry (有)',null,null,2,1,'ヘッド棚下',null,1800,990),
('GR-ST-003','S-1 Light midnight (有)',null,null,2,1,null,null,1800,990),
('GR-ST-004','S-1 PROTO TYPE ネイビー×ホワイト　(有）',null,null,2,1,null,null,2000,1100),
('GR-ST-005','S-1 ブラック×アイボリー　(有）',null,null,2,1,null,null,2000,1100),
('GR-ST-006','M-3 LIGHT ブラック×イエロー　(有）',null,null,2,1,null,null,1300,715),
('GR-ST-007','T-1 セミミッド　ブラック(有）',null,null,2,1,null,null,1450,725),
('GR-ST-008','T-1 セミミッド　ブラック(無）',null,null,2,1,null,null,1450,725),
('GR-ST-009','G-REX (有)',null,null,2,1,'ヘッド棚下',null,1600,800),
('GR-PP-001','X HOLD BLACK RUBBER　ｵﾚﾝｼﾞ (無)',null,null,2,1,null,null,1800,1080),
('GR-PP-002','X HOLD BLACK RUBBER　ｵﾚﾝｼﾞ (有)',null,null,2,1,null,null,1800,1080),
('GR-PP-003','X HOLD BLACK RUBBER　Eｸﾞﾘｰﾝ (無)',null,null,2,1,null,null,1800,1080),
('GR-PP-004','X HOLD BLACK RUBBER　Eｸﾞﾘｰﾝ (有)',null,null,2,1,null,null,1800,1080),
('GR-PP-005','X HOLD BLACK RUBBER　ｽｶｲﾌﾞﾙｰ (有)',null,null,2,1,null,null,1800,1080),
('GR-PP-006','X HOLD BLACK RUBBER　ﾋﾟﾝｸ (有)',null,null,2,1,null,null,1800,1080),
('GR-PP-007','X HOLD BLACK RUBBER　ﾊﾟｰﾌﾟﾙ (有)',null,null,2,1,null,null,1800,1080),
('GR-PP-008','X HOLD BLACK RUBBER　ｲｴﾛｰ (有)',null,null,2,1,null,null,1800,1080),
('GR-PP-009','X HOLD BLACK RUBBER　ﾚｯﾄﾞ (有)',null,null,2,0,null,null,1800,1080),
('GR-PP-010','X HOLD BLACK RUBBER　ﾌﾞﾗｯｸ (有)',null,null,2,0,null,null,1800,1080),
('GR-PP-011','X HOLD BLACK RUBBER　ﾌﾞﾙｰ (有)',null,null,2,0,null,null,1800,1080),
('GR-PP-012','X HOLD BLACK HALF CORD　ﾌﾞﾙｰ (有)',null,null,2,1,null,null,2000,1200),
('GR-PP-013','X HOLD BLACK HALF CORD　ｽｶｲﾌﾞﾙｰ (有)',null,null,2,1,null,null,2000,1200),
('GR-PP-014','X HOLD BLACK HALF CORD　ﾚｯﾄﾞ (有)',null,null,2,1,null,null,2000,1200),
('GR-PP-015','X HOLD RUBBER 　ﾌﾞﾗｯｸ×ﾌﾞﾗｯｸ (無)',null,null,1,0,null,null,2000,1200),
('GR-PP-016','X LINE RUBBER　ﾌﾞﾗｯｸ (有)',null,null,2,1,null,null,1700,1020),
('GR-PP-017','X LINE RUBBER　ﾌﾞﾙｰ (有)',null,null,2,1,null,null,1700,1020),
('GR-PP-018','X LINE RUBBER　ﾎﾜｲﾄ (有)',null,null,2,1,null,null,1700,1020),
('GR-PP-019','X SOFT LADIE''S　ﾃﾞｨｰﾌﾟﾌﾞﾙｰ(有)',null,null,2,1,null,null,1300,780),
('GR-PP-020','X SOFT LADIE''S　ﾌﾞﾗｯｸ(有)',null,null,2,1,null,null,1300,780),
('GR-PP-021','X HOLD BLACK  CORD　ﾚｯﾄﾞ (有)',null,null,1,0,null,null,null,null),
('GR-GP-001','MCC スタンダード　ﾎﾜｲﾄ (有)',null,null,2,1,'ヘッド棚下',null,2500,1500),
('GR-GP-002','MCC スタンダード　ﾎﾜｲﾄ (無)',null,null,2,1,'ヘッド棚下',null,2500,1500),
('GR-GP-003','MCC TEAMS スタンダード　ﾌﾞﾗｯｸ/ｺﾞｰﾙﾄﾞ (無)',null,null,2,1,null,null,2500,1500),
('GR-GP-004','MCC TEAMS スタンダード　ﾀﾞｰｸﾚｯﾄﾞ/ｲｴﾛｰ(無)',null,null,2,1,null,null,2500,1500),
('GR-GP-005','MCC・ALIGN スタンダード (有)',null,null,2,1,null,null,2600,1560),
('GR-GP-006','MCC+4 ALIGN  STD (有)',null,null,2,1,null,null,2600,1560),
('GR-GP-007','Tour Velvet (有)',null,null,2,1,'ヘッド棚下',null,1300,819),
('GR-GP-008','Tour Velvet (無)',null,null,2,1,null,null,1300,819),
('GR-GP-009','Tour Velvet PLUS4 スタンダード (無)',null,null,2,1,null,null,1300,819),
('GR-GP-010','Tour Velvet 360 LITE (無)',null,null,2,0,null,null,1500,945),
('GR-GP-011','CP2 Pro スタンダード',null,null,2,1,null,null,2100,1470),
('GR-GP-012','CP2 Wrap スタンダード',null,null,2,0,null,null,2100,1470),
('GR-EL-001','TD50C ﾏﾘﾝﾌﾞﾙｰ (無)',null,null,2,1,'ヘッド棚下',null,1500,750),
('GR-EL-002','TD50C ﾏﾘﾝﾌﾞﾙｰ (有)',null,null,2,1,'ヘッド棚下',null,1500,750),
('GR-EL-003','TD50C ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (無)',null,null,2,1,'ヘッド棚下',null,1500,750),
('GR-EL-004','TD50C ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (有)',null,null,2,1,'ヘッド棚下',null,1500,750),
('GR-EL-005','Y360S XT ｼﾙﾊﾞｰﾎﾜｲﾄ (無)',null,null,2,1,null,null,1800,900),
('GR-EL-006','Y360S XT ｼﾙﾊﾞｰﾎﾜｲﾄ (有)',null,null,2,1,null,null,1800,900),
('GR-EL-007','Y360S XT ﾏﾘﾝﾌﾞﾙｰ (無)',null,null,2,1,'ヘッド棚下',null,1800,900),
('GR-EL-008','Y360S XT ﾏﾘﾝﾌﾞﾙｰ (有)',null,null,2,1,'ヘッド棚下',null,1800,900),
('GR-EL-009','Y360S XT ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (無)',null,null,2,1,'ヘッド棚下',null,1800,900),
('GR-EL-010','Y360S XT ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (有)',null,null,2,1,'ヘッド棚下',null,1800,900),
('GR-EL-011','スティングレー　M58 ﾌﾞﾗｯｸ (無)',null,null,2,1,null,null,1600,800),
('GR-EL-012','スティングレー　M58 ﾌﾞﾗｯｸ (有)',null,null,2,1,null,null,1600,800),
('GR-EL-013','スティングレー　M60 ﾌﾞﾗｯｸ (無)',null,null,2,1,null,null,1600,800),
('GR-EL-014','スティングレー　M60 ﾌﾞﾗｯｸ (有)',null,null,2,1,'ヘッド棚下',null,1600,800),
('GR-EL-015','Y360Star ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (有)',null,null,1,0,null,null,1800,900),
('GR-EL-016','Y360Star ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (無)',null,null,1,0,null,null,1800,900),
('GR-EL-017','Y360SH ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (無)',null,null,2,1,'ヘッド棚下',null,2000,1000),
('GR-EL-018','Y360SH ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (有)',null,null,2,1,'ヘッド棚下',null,2000,1000),
('GR-EL-019','TD50C ﾍﾞﾈｲﾋﾞｰ (無)',null,null,2,1,'ヘッド棚下',null,1500,750),
('GR-EL-020','TD50C ﾍﾞﾈｲﾋﾞｰ (有)',null,null,2,1,null,null,1500,750),
('GR-EL-021','X360ラバー 　ﾌﾞﾙｰ  (無)',null,null,2,1,null,null,1150,575),
('GR-EL-022','X360ラバー 　ﾌﾞﾙｰ (有)',null,null,2,1,null,null,1150,575),
('GR-EL-023','X360ラバー　 ﾚｯﾄﾞ  (無)',null,null,2,1,null,null,1150,575),
('GR-EL-024','X360ラバー 　ﾚｯﾄﾞ (有)',null,null,2,1,null,null,1150,575),
('GR-EL-025','X360ラバー 　ﾌﾞﾗｯｸ  (無)',null,null,2,1,null,null,1150,575),
('GR-EL-026','X360ラバー　 ﾌﾞﾗｯｸ (有)',null,null,2,1,null,null,1150,575),
('GR-EL-027','SX38 ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ (有)',null,null,2,1,null,null,1400,700),
('GR-EL-028','SX38 ｼﾙﾊﾞｰﾎﾜｲﾄ  (有)',null,null,2,1,'ヘッド棚下',null,1400,700),
('GR-EL-029','ラッキースター  ﾌﾞﾗｯｸ(有)',null,null,1,0,null,null,1400,700),
('GR-EL-030','ラッキースター  ﾌﾞﾗｯｸ(無)',null,null,1,0,null,null,1400,700),
('PG-SS-001','TRAXION Pistol GT TOUR WH/SV',null,null,2,1,null,null,3800,2660),
('PG-SS-002','Zenergy Pistol GT 1.0　BK/WH',null,null,1,0,null,null,5000,3250),
('PG-SS-003','Zenergy Pistol GT 1.0　WH/RD',null,null,1,0,null,null,5000,3250),
('PG-SS-004','Zenergy Pistol GT 2.0　BK/WH',null,null,1,0,null,null,5000,3250),
('PG-SS-005','Zenergy Pistol GT 2.0　WH/RD',null,null,1,0,null,null,5000,3250),
('PG-LM-001','SINK FIT PISTOL　ﾌﾞﾗｯｸ×ﾌﾞﾙｰ　63ｇ',null,null,2,1,null,null,3800,2660),
('PG-EL-001','GeRON#N1　ﾏﾘﾝﾌﾞﾙｰ',null,null,2,1,null,null,3800,1900),
('PG-EL-002','GeRON#N1　ﾈｲﾋﾞｰ',null,null,2,1,null,null,3800,1900),
('PG-EL-003','GeRON#N1　ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ',null,null,1,0,null,null,3800,1900),
('PG-EL-004','GeRON#N2　ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ',null,null,1,0,null,null,3800,1900),
('PG-EL-005','GeRON#N3　ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ',null,null,1,0,null,null,3800,1900),
('PG-EL-006','RS74　ｼﾙﾊﾞｰﾎﾜｲﾄ',null,null,2,0,null,null,3500,1750),
('PG-EL-007','RS74　ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ',null,null,2,0,null,null,3500,1750),
('PG-EL-008','RS74　ｸﾗｯｼｯｸﾚｯﾄﾞ',null,null,2,1,null,null,3500,1750),
('PG-EL-009','RS60　ｼﾙﾊﾞｰﾎﾜｲﾄ',null,null,2,1,null,null,3500,1750),
('PG-EL-010','RS60　ﾍﾞﾙﾘﾅﾌﾞﾗｯｸ',null,null,2,1,null,null,3500,1750),
('PG-EL-011','うまい棒',null,'ｺｰﾝﾎﾟﾀｰｼﾞｭ味',2,1,null,null,3800,1900),
('PG-EL-012','うまい棒',null,'たこ焼き味',2,1,null,null,3800,1900),
('PG-EL-013','うまい棒',null,'めんたいこ味',2,1,null,null,3800,1900),
('PG-EL-014','うまい棒',null,'チーズ味',2,1,null,null,3800,1900),
('PG-IO-001','Putter Grip Regular ﾌﾞﾗｯｸ',null,null,1,0,null,null,2800,1624),
('PG-IO-002','Putter Grip Mid ﾌﾞﾗｯｸ',null,null,1,0,null,null,2800,1624),
('PG-IO-003','Putter Grip Large ﾌﾞﾗｯｸ',null,null,1,0,null,null,3300,1914),
('PG-IO-004','I-CLASIC Regular ﾌﾞﾗｯｸ',null,null,1,0,null,null,3300,1914),
('PG-IO-005','I-CLASIC Mid ﾌﾞﾗｯｸ',null,null,1,0,null,null,2800,1624),
('PG-IO-006','I-CLASIC TOUR PUTTERブラック',null,null,1,0,null,null,3800,2204),
('GL-IO-001','X-FIT レディース 　右　20㎝',null,null,3,1,null,null,1900,1102),
('GL-IO-002','X-FIT レディース 　左　20㎝',null,null,3,1,null,null,1900,1102),
('GL-IO-003','X-FIT　左　21cm',null,null,3,1,null,null,1900,1102),
('GL-IO-004','X-FIT　左　22㎝',null,null,3,1,null,null,1900,1102),
('GL-IO-005','X-FIT　左　24㎝',null,null,3,1,null,null,1900,1102),
('GL-IO-006','X-FIT　左　25㎝',null,null,3,1,null,null,1900,1102),
('GL-FL-001','Cabretta　Leather　21㎝',null,null,3,1,null,null,2870,1722),
('GL-FL-002','Cabretta　Leather　22㎝',null,null,3,1,null,null,2870,1722),
('GL-FL-003','Cabretta　Leather　23㎝',null,null,3,1,null,null,2870,1722),
('GL-FL-004','Cabretta　Leather　24㎝',null,null,3,1,null,null,2870,1722),
('GL-FL-005','Weather Fit(全天候型)　18㎝ ピンク',null,null,3,1,null,null,2070,1242),
('GL-FL-006','Weather Fit(全天候型)　19㎝',null,null,3,1,null,null,2070,1242),
('GL-FL-007','Weather Fit(全天候型)　20㎝',null,null,3,1,null,null,2070,1242),
('GL-FL-008','Weather Fit(全天候型)　21㎝',null,null,3,1,null,null,2070,1242),
('GL-FL-009','Weather Fit(全天候型)　22㎝',null,null,3,1,null,null,2070,1242),
('GL-FL-010','Weather Fit(全天候型)　23㎝',null,null,3,1,null,null,2070,1242),
('GL-FL-011','Weather Fit(全天候型)　24㎝',null,null,3,1,null,null,2070,1242),
('GL-FL-012','Weather Fit(全天候型)　25㎝',null,null,3,1,null,null,2070,1242),
('GL-IS-001','2024ZERO FIT　19㎝　左',null,null,3,1,null,null,1800,1080),
('GL-IS-002','2024ZERO FIT　20㎝　左',null,null,3,1,null,null,1800,1080),
('GL-IS-003','2024ZERO FIT　21㎝　左',null,null,3,1,null,null,1800,1080),
('GL-IS-004','2024ZERO FIT　22㎝　左',null,null,3,1,null,null,1800,1080),
('GL-IS-005','2024ZERO FIT　23㎝　左',null,null,3,1,null,null,1800,1080),
('GL-IS-006','2024ZERO FIT　24㎝　左',null,null,3,1,null,null,1800,1080),
('GL-IS-007','2024ZERO FIT　25㎝　左',null,null,3,1,null,null,1800,1080),
('GL-IS-008','2024ZERO FIT　26㎝　左',null,null,3,0,null,null,1800,1080),
('GL-IS-009','2024ZERO FIT　19㎝　左　黒',null,null,3,0,null,null,1800,1080),
('GL-IS-010','2024ZERO FIT　20㎝　左　黒',null,null,3,0,null,null,1800,1080),
('GL-IS-011','2024ZERO FIT　21㎝　左　黒',null,null,3,0,null,null,1800,1080),
('GL-IS-012','2024ZERO FIT　22㎝　左　黒',null,null,3,0,null,null,null,null),
('GL-IS-013','2024ZERO FIT　23㎝　左　黒',null,'黒',3,0,null,null,1800,1080),
('GL-IS-014','2024ZERO FIT　24㎝　左　黒',null,'黒',3,0,null,null,1800,1080),
('GL-IS-015','2024ZERO FIT　25㎝　左　黒',null,'黒',3,0,null,null,1800,1080),
('GL-IS-016','2024ZERO FIT　26㎝　左　黒',null,null,1,0,null,null,1800,1080),
('GL-IS-017','2024ZERO FIT　19㎝　右',null,null,3,0,null,null,1800,1080),
('GL-IS-018','2024ZERO FIT　20㎝　右',null,null,3,1,null,null,1800,1080),
('GL-IS-019','2024ZERO FIT　21㎝　右',null,null,1,0,null,null,1800,1080),
('GL-IS-020','2024ZERO FIT　22㎝　右',null,null,1,0,null,null,null,null),
('GL-IS-021','2024ZERO FIT　23㎝　右',null,null,1,0,null,null,null,null),
('GL-IS-022','2024ZERO FIT　19㎝　右　黒',null,null,1,0,null,null,1800,1080),
('GL-IS-023','2024ZERO FIT　20㎝　右　黒',null,null,1,0,null,null,1800,1080),
('GL-IS-024','2024ZERO FIT　21㎝　右　黒',null,'黒',3,0,null,null,1800,1080),
('GL-IS-025','2024ZERO FIT　22㎝　右　黒',null,null,1,0,null,null,null,null),
('GL-IS-026','2024ZERO FIT　23㎝　右　黒',null,'黒',3,0,null,null,1800,1080),
('GL-IS-027','2024ZERO FIT　24㎝　右　黒',null,'黒',3,0,null,null,1800,1080),
('GL-IS-028','2024ZERO FIT　25㎝　右　黒',null,'黒',3,0,null,null,1800,1080),
('PR-DA-001','WRAPPING GRIP',null,'1800',2,1,null,null,1800,1080),
('PR-EL-001','ELT 1 SPEED       ORANGE',null,'12000',2,1,null,null,12000,7200),
('PR-EL-002','ELT 1 SPEED       GREEN',null,'12000',2,1,null,null,12000,7200),
('PR-EL-003','ELT 1 SPEED       RED',null,'12000',2,1,null,null,12000,7200),
('PR-EL-004','ELT 1 SPEED       BLACK',null,'12000',2,1,null,null,12000,7200),
('PR-EL-005','ELT 1 SPEED エボリューション                    BLACK',null,'15000',2,1,null,null,15000,9750),
('PR-EL-006','ELT 1 SPEED ヘビーヒッターレッド            RED',null,'15000',2,1,null,null,15000,9750),
('PR-EL-007','I PLANE PRO スイング練習器具',null,'12000',2,1,null,null,12000,7200),
('PR-EL-008','ELT 1 SPEED  DRIVER',null,'15000',2,0,null,null,1000,900),
('PR-EL-009','SPEED PLANE',null,'15000',2,0,null,null,15000,9750),
('PR-EL-010','パイソンクラブコイル　40/50',null,null,1,0,null,null,3800,1900),
('PR-EL-011','パイソンクラブコイル　20/30',null,null,1,0,null,null,2800,1400),
('PR-LT-001','ウェイトアップ90　G-261　黒',null,'1000',1,1,null,null,1000,763),
('PR-LT-002','三角先生',null,null,1,0,null,null,3000,1650),
('AC-AK-001','パターキャッチャー、グリーンフォーク',null,null,1,4,'受付在庫ケース',null,1500,910),
('AC-SR-001','各種',null,null,3,1,null,null,980,686),
('PS-EL-001','パラソル　大',null,null,2,1,null,null,9800,6370),
('PS-EL-002','パラソル　小',null,null,2,1,null,null,7800,5070),
('RW-EL-001','smart sihouette rainwear L',null,null,1,0,null,null,9800,8330),
('RW-EL-002','smart sihouette rainwear LL',null,null,1,0,null,null,9800,8330),
('TE-US-001','TOUR Tee COMBO     ミックス',null,'1000',1,1,null,null,1000,600),
('TE-US-002','TOUR Tee PRO　　ブルー/グレー',null,'1000',1,1,null,null,1000,600),
('TE-US-003','TOUR Tee PRO WHITE SPINE',null,'1000',1,0,null,null,1000,600),
('TE-US-004','TOUR Tee PRO BLACK SPINE',null,'1000',1,0,null,null,1000,600),
('TE-US-005','TOUR Tee MINI',null,'1000',1,1,null,null,1000,600),
('TE-US-006','TOUR Tee LIMITED EDITION　 ミックス',null,'1000',1,1,null,null,1000,600),
('TE-US-007','TOUR Tee LIMITED EDITION　ブラック',null,'1000',1,1,null,null,1000,600),
('TE-US-008','TOUR Tee PLUS +',null,'1000',1,1,null,null,1000,600),
('TE-US-009','TOUR Tee LARGE',null,'1000',1,1,null,null,1000,600),
('TE-US-010','TORNADO TEE レッド/ホワイト',null,null,1,0,null,null,1000,600),
('TE-US-011','TORNADO TEE ブラック',null,null,1,0,null,null,1000,600),
('CB-EV-001','BALDO 2023 NEW STAND CADDIE BAG  ブラック（HC付）',null,'86000',1,10,null,null,86000,60200),
('CB-EV-002','BALDO 2023 NEW STAND CADDIE BAG  シルバー（単品）',null,'66000',1,10,null,null,60000,40200),
('CB-AR-001','ARCH STAND MODEL',null,null,1,10,null,null,0,0),
('CB-AR-002','ARCH TOUR MODEL',null,null,1,10,null,null,0,0)
) v(code,name,spec,variant,u,l,location2,notes,list_price,cost_price)
join inv_codes cat on cat.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and cat.kind='category' and cat.abbr=split_part(v.code,'-',1) and cat.deleted_at is null
join inv_codes mk  on mk.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7'  and mk.kind='maker'    and mk.abbr=split_part(v.code,'-',2) and mk.deleted_at  is null
on conflict do nothing;

-- 2025-12-31 棚卸（339品番・全量）
insert into inv_count_sessions (company_id,store_id,counted_on,label,status,closed_at,note) values ('ec00ad2a-4032-4061-bdb7-03face8a04e7','82bb4e18-427d-4cc7-a834-c9e2a9b18199','2025-12-31','2025年12月末 棚卸','closed','2025-12-31 23:59:59+09','エクセル(202606_ゴルフウィング在庫リスト.xlsm)からの移行分。当時は入出庫台帳が無く理論在庫が存在しないため theoretical/diff は null') on conflict do nothing;
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2025-12-31' and deleted_at is null),i.id,v.q,'2026-01-06 10:00:00+09'::timestamptz,'古川・小川' from (values
('DRC-TM-001',1),('DRC-CA-001',1),('DRC-CA-002',0),('DRH-EV-001',1),('DRH-EV-002',1),('DRH-EV-003',2),('DRH-EV-004',2),('DRH-EV-005',2),('DRH-EV-006',1),('DRH-EV-007',2),('DRH-EV-008',1),('DRH-EV-009',2),('DRH-EV-010',1),('DRH-EV-011',0),('DRH-EV-012',1),('DRH-EV-013',1),('DRH-EV-014',0),('DRH-CO-001',0),('DRH-CO-002',0),('DRH-CO-003',0),('DRH-CO-004',0),('DRH-CO-005',0),('DRH-CO-006',0),('DRH-CO-007',0),('DRH-CO-008',0),('DRH-CO-009',0),('DRH-CO-010',0),('DRH-CO-011',0),('DRH-CO-012',0),('DRH-CO-013',1),('DRH-CO-014',1),('DRH-NA-001',2),('DRH-WA-001',1),('DRH-WA-002',0),('FWC-TM-001',1),('FWH-EV-001',2),('FWH-CO-001',0),('FWH-CO-002',0),('FWH-CO-003',0),('FWH-CO-004',0),('FWH-CO-005',0),('FWH-CO-006',0),('FWH-CO-007',0),('UTH-EV-001',1),('UTH-EV-002',0),('UTH-EV-003',0),('WDH-EV-001',2),('WDH-EV-002',2),('WDH-EV-003',2),('WDH-EV-004',2),('HC-CO-001',0),('HC-CO-002',0),('HC-CO-003',0),('HC-CO-004',0),('HC-CO-005',0),('HC-CO-006',0),('HC-EV-001',2),('HC-EV-002',3),('HC-EV-003',1),('HC-EV-004',1),('HC-WA-001',2),('HC-MX-001',17),('WR-WA-001',0),('WR-CO-001',7),('BL-AC-001',0),('BL-AC-002',0),('BL-AC-003',3),('BL-AC-004',7),('BL-AC-007',0),('BL-AC-008',3),('BL-AC-009',2),('BL-AC-010',5),('BL-AC-014',4),('BL-BS-001',2),('BL-BS-002',0),('BL-BS-003',0),('BL-BS-004',2),('BL-BS-005',1),('BL-DL-001',0),('BL-DL-002',0),('BL-DL-003',0),('BL-DL-004',0),('SF-SG-001',1),('SF-SG-002',1),('SF-SG-003',1),('SF-DT-001',1),('SF-DT-002',1),('SF-DT-003',1),('SF-DT-004',1),('SF-DT-005',1),('SF-DT-006',1),('SF-OL-001',1),('SF-CT-001',1),('SL-WK-001',3),('SL-WK-002',3),('SL-WK-003',3),('SL-WK-004',3),('SL-WK-005',0),('SL-WK-008',3),('SL-CO-001',0),('SL-CO-002',14),('SL-WK-009',4),('SL-WK-010',3),('SL-MZ-001',1),('SL-EV-001',2),('SL-WA-001',1),('SL-EB-001',1),('WT-CO-001',1),('WT-CO-002',1),('WT-CO-003',1),('WT-CO-004',1),('WT-CO-005',1),('WT-CO-006',1),('WT-CO-007',1),('WT-CO-008',1),('GC-HL-001',6),('GC-HL-002',0),('GR-IO-001',24),('GR-IO-002',0),('GR-IO-003',5),('GR-IO-004',14),('GR-IO-005',21),('GR-IO-006',5),('GR-IO-008',5),('GR-IO-009',11),('GR-IO-010',16),('GR-IO-011',0),('GR-IO-012',0),('GR-IO-013',14),('GR-IO-016',0),('GR-IO-017',0),('GR-IO-018',0),('GR-IO-019',8),('GR-IO-020',8),('GR-IO-021',9),('GR-IO-022',10),('GR-IO-023',12),('GR-IO-024',11),('GR-IO-025',11),('GR-IO-026',15),('GR-IO-027',3),('GR-IO-028',0),('GR-IO-029',5),('GR-IO-030',4),('GR-IO-031',4),('GR-IO-032',0),('GR-IO-033',3),('GR-IO-036',10),('GR-IO-037',8),('GR-IO-038',5),('GR-IO-039',4),('GR-IO-040',3),('GR-IO-041',4),('GR-IO-042',0),('GR-IO-043',2),('GR-IO-044',8),('GR-IO-045',3),('GR-IO-047',15),('GR-IO-048',0),('GR-IO-049',0),('GR-IO-050',0),('GR-LF-001',11),('GR-CD-001',2),('GR-CD-002',4),('GR-CD-003',6),('GR-CD-004',3),('GR-ST-002',6),('GR-ST-003',5),('GR-ST-004',15),('GR-ST-005',16),('GR-ST-006',4),('GR-ST-007',11),('GR-ST-008',12),('GR-ST-009',14),('GR-PP-001',9),('GR-PP-002',5),('GR-PP-003',10),('GR-PP-004',12),('GR-PP-005',0),('GR-PP-006',2),('GR-PP-007',5),('GR-PP-008',2),('GR-PP-009',3),('GR-PP-010',0),('GR-PP-011',0),('GR-PP-012',7),('GR-PP-013',0),('GR-PP-014',3),('GR-PP-015',7),('GR-PP-016',1),('GR-PP-017',4),('GR-PP-018',5),('GR-PP-019',3),('GR-PP-020',0),('GR-GP-001',33),('GR-GP-002',17),('GR-GP-003',0),('GR-GP-004',8),('GR-GP-005',0),('GR-GP-006',7),('GR-GP-007',14),('GR-GP-008',20),('GR-GP-009',6),('GR-GP-010',17),('GR-GP-011',10),('GR-GP-012',0),('GR-EL-001',10),('GR-EL-002',9),('GR-EL-003',5),('GR-EL-004',4),('GR-EL-005',9),('GR-EL-006',10),('GR-EL-007',8),('GR-EL-008',9),('GR-EL-009',9),('GR-EL-010',8),('GR-EL-011',10),('GR-EL-012',9),('GR-EL-013',7),('GR-EL-014',11),('GR-EL-015',15),('GR-EL-016',9),('GR-EL-017',6),('GR-EL-018',5),('GR-EL-019',9),('GR-EL-020',3),('GR-EL-021',12),('GR-EL-022',9),('GR-EL-023',10),('GR-EL-024',14),('GR-EL-025',8),('GR-EL-026',9),('GR-EL-027',7),('GR-EL-028',11),('GR-EL-029',4),('GR-EL-030',9),('PG-SS-001',0),('PG-SS-002',0),('PG-SS-003',1),('PG-SS-004',1),('PG-SS-005',0),('PG-LM-001',0),('PG-EL-001',0),('PG-EL-002',1),('PG-EL-003',1),('PG-EL-004',0),('PG-EL-005',1),('PG-EL-006',0),('PG-EL-007',0),('PG-EL-008',0),('PG-EL-009',1),('PG-EL-010',1),('PG-EL-011',1),('PG-EL-012',0),('PG-EL-013',1),('PG-EL-014',0),('PG-IO-001',1),('PG-IO-002',0),('PG-IO-003',1),('PG-IO-004',1),('PG-IO-005',1),('PG-IO-006',1),('GL-IO-001',1),('GL-IO-002',0),('GL-IO-003',0),('GL-IO-004',1),('GL-IO-005',0),('GL-IO-006',0),('GL-FL-001',1),('GL-FL-002',0),('GL-FL-003',0),('GL-FL-004',1),('GL-FL-005',1),('GL-FL-006',1),('GL-FL-007',2),('GL-FL-008',2),('GL-FL-009',3),('GL-FL-010',5),('GL-FL-011',4),('GL-FL-012',0),('GL-IS-001',0),('GL-IS-002',6),('GL-IS-003',1),('GL-IS-004',0),('GL-IS-005',2),('GL-IS-006',4),('GL-IS-007',5),('GL-IS-008',3),('GL-IS-009',1),('GL-IS-010',2),('GL-IS-011',0),('GL-IS-013',3),('GL-IS-014',2),('GL-IS-015',1),('GL-IS-016',1),('GL-IS-017',3),('GL-IS-018',8),('GL-IS-019',5),('GL-IS-022',4),('GL-IS-023',2),('GL-IS-024',0),('GL-IS-026',1),('GL-IS-027',1),('GL-IS-028',1),('PR-DA-001',2),('PR-EL-001',1),('PR-EL-002',0),('PR-EL-003',0),('PR-EL-004',0),('PR-EL-005',1),('PR-EL-006',1),('PR-EL-007',1),('PR-EL-008',1),('PR-EL-009',4),('PR-EL-010',2),('PR-EL-011',2),('PR-LT-001',1),('PR-LT-002',1),('AC-AK-001',16),('AC-SR-001',7),('PS-EL-001',0),('PS-EL-002',1),('RW-EL-001',1),('RW-EL-002',0),('TE-US-001',0),('TE-US-002',0),('TE-US-003',0),('TE-US-004',0),('TE-US-005',0),('TE-US-006',0),('TE-US-007',0),('TE-US-008',2),('TE-US-009',1),('TE-US-010',0),('TE-US-011',1),('CB-EV-001',1),('CB-EV-002',1),('CB-AR-001',1),('CB-AR-002',1)
) v(c,q) join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c and i.deleted_at is null
on conflict (session_id,item_id) do update set qty=excluded.qty;

-- 2026-01-31 棚卸（339品番 / 前月から 消滅0・変化37）
insert into inv_count_sessions (company_id,store_id,counted_on,label,status,closed_at,note) values ('ec00ad2a-4032-4061-bdb7-03face8a04e7','82bb4e18-427d-4cc7-a834-c9e2a9b18199','2026-01-31','2026年1月末 棚卸','closed','2026-01-31 23:59:59+09','エクセル(202606_ゴルフウィング在庫リスト.xlsm)からの移行分。当時は入出庫台帳が無く理論在庫が存在しないため theoretical/diff は null') on conflict do nothing;
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-01-31' and deleted_at is null),c.item_id,c.qty,'2026-01-31 16:00:00+09'::timestamptz,'古川' from inv_counts c where c.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2025-12-31' and deleted_at is null)
on conflict (session_id,item_id) do nothing;
update inv_counts t set qty=v.q from (values ('BL-AC-003',2),('BL-AC-004',6),('BL-AC-008',2),('BL-BS-001',0),('BL-BS-004',0),('BL-BS-005',0),('GL-IS-001',6),('GL-IS-002',3),('GL-IS-003',5),('GL-IS-004',6),('GL-IS-005',6),('GL-IS-007',6),('GL-IS-008',6),('GL-IS-009',6),('GL-IS-010',1),('GL-IS-018',7),('GL-IS-019',4),('GL-IS-022',3),('GL-IS-023',1),('GR-EL-007',7),('GR-EL-009',8),('GR-GP-006',6),('GR-GP-008',18),('GR-IO-001',26),('GR-IO-002',10),('GR-IO-003',15),('GR-IO-008',12),('GR-IO-009',0),('GR-IO-021',8),('GR-IO-025',12),('GR-IO-027',5),('GR-IO-030',5),('GR-PP-009',1),('SL-CO-001',14),('SL-CO-002',3),('SL-WK-005',1),('SL-WK-008',0)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c where t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-01-31' and deleted_at is null) and t.item_id=i.id;

-- 2026-02-28 棚卸（342品番 / 前月から 消滅0・変化42）
insert into inv_count_sessions (company_id,store_id,counted_on,label,status,closed_at,note) values ('ec00ad2a-4032-4061-bdb7-03face8a04e7','82bb4e18-427d-4cc7-a834-c9e2a9b18199','2026-02-28','2026年2月末 棚卸','closed','2026-02-28 23:59:59+09','エクセル(202606_ゴルフウィング在庫リスト.xlsm)からの移行分。当時は入出庫台帳が無く理論在庫が存在しないため theoretical/diff は null') on conflict do nothing;
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-02-28' and deleted_at is null),c.item_id,c.qty,'2026-02-26 15:00:00+09'::timestamptz,'福原' from inv_counts c where c.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-01-31' and deleted_at is null)
on conflict (session_id,item_id) do nothing;
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-02-28' and deleted_at is null),i.id,v.q,'2026-02-26 15:00:00+09'::timestamptz,'福原' from (values ('BL-AC-011',6),('BL-AC-012',6),('BL-AC-015',6)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c and i.deleted_at is null
on conflict (session_id,item_id) do update set qty=excluded.qty;
update inv_counts t set qty=v.q from (values ('BL-AC-003',8),('BL-AC-004',12),('BL-AC-008',1),('BL-BS-001',4),('BL-BS-002',3),('BL-BS-003',4),('BL-BS-004',3),('GL-IS-001',5),('GL-IS-002',2),('GL-IS-004',5),('GL-IS-005',5),('GL-IS-006',1),('GL-IS-009',3),('GR-EL-003',4),('GR-EL-016',3),('GR-EL-028',10),('GR-GP-001',32),('GR-GP-002',16),('GR-GP-008',13),('GR-GP-009',4),('GR-IO-005',19),('GR-IO-008',10),('GR-IO-013',7),('GR-IO-022',9),('GR-IO-028',15),('GR-IO-030',1),('GR-IO-049',6),('GR-PP-009',0),('GR-PP-014',0),('GR-PP-015',6),('GR-PP-017',3),('GR-ST-005',13),('GR-ST-009',10),('PG-IO-006',0),('PR-LT-002',0),('SL-CO-002',6),('SL-WK-001',4),('SL-WK-003',4),('SL-WK-004',0),('SL-WK-005',2),('SL-WK-008',1),('TE-US-008',1)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c where t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-02-28' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-02-27 12:30:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('SF-SG-001','SF-SG-002','SF-SG-003','SF-DT-001','SF-DT-002','SF-DT-003','SF-DT-004','SF-DT-005','SF-DT-006','SF-OL-001','SF-CT-001','SL-WK-001','SL-WK-002','SL-WK-003','SL-WK-004','SL-WK-005','SL-WK-008','SL-CO-001','SL-CO-002','SL-WK-009','SL-WK-010','SL-MZ-001','SL-EV-001','SL-WA-001','SL-EB-001','WT-CO-001','WT-CO-002','WT-CO-003','WT-CO-004','WT-CO-005','WT-CO-006','WT-CO-007','WT-CO-008','GC-HL-001','GC-HL-002') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-02-28' and deleted_at is null) and t.item_id=i.id;

-- 2026-03-31 棚卸（353品番 / 前月から 消滅1・変化37）
insert into inv_count_sessions (company_id,store_id,counted_on,label,status,closed_at,note) values ('ec00ad2a-4032-4061-bdb7-03face8a04e7','82bb4e18-427d-4cc7-a834-c9e2a9b18199','2026-03-31','2026年3月末 棚卸','closed','2026-03-31 23:59:59+09','エクセル(202606_ゴルフウィング在庫リスト.xlsm)からの移行分。当時は入出庫台帳が無く理論在庫が存在しないため theoretical/diff は null') on conflict do nothing;
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-03-31' and deleted_at is null),c.item_id,c.qty,'2026-03-27 15:30:00+09'::timestamptz,'谷川' from inv_counts c where c.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-02-28' and deleted_at is null)
on conflict (session_id,item_id) do nothing;
delete from inv_counts where session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-03-31' and deleted_at is null) and item_id in (select id from inv_items where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and code in ('GC-HL-001'));
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-03-31' and deleted_at is null),i.id,v.q,'2026-03-27 15:30:00+09'::timestamptz,'谷川' from (values ('BL-AC-013',6),('BL-BS-006',1),('DRH-CO-015',1),('DRH-CO-016',1),('GL-IS-020',1),('GL-IS-021',1),('GL-IS-025',2),('GR-IO-007',0),('GR-IO-034',10),('GR-IO-035',10),('GR-IO-046',4),('GR-ST-001',4)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c and i.deleted_at is null
on conflict (session_id,item_id) do update set qty=excluded.qty;
update inv_counts t set qty=v.q from (values ('BL-AC-003',7),('BL-AC-004',11),('BL-AC-014',3),('GL-FL-011',2),('GL-IS-002',0),('GL-IS-004',3),('GL-IS-006',9),('GL-IS-009',6),('GL-IS-010',3),('GL-IS-018',5),('GL-IS-019',5),('GL-IS-024',2),('GR-EL-006',9),('GR-EL-007',6),('GR-EL-016',2),('GR-GP-002',17),('GR-GP-008',12),('GR-GP-009',3),('GR-GP-010',16),('GR-IO-002',8),('GR-IO-006',4),('GR-IO-008',7),('GR-IO-009',10),('GR-IO-013',16),('GR-IO-024',10),('GR-IO-027',6),('GR-IO-029',6),('GR-IO-031',3),('GR-IO-039',3),('GR-PP-012',6),('GR-PP-015',5),('GR-PP-017',4),('GR-ST-004',14),('GR-ST-009',14),('SL-MZ-001',2),('SL-WK-009',3),('SL-WK-010',5)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c where t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-03-31' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-03-30 16:00:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('DRC-TM-001','DRC-CA-001','DRC-CA-002','DRH-EV-001','DRH-EV-002','DRH-EV-003','DRH-EV-004','DRH-EV-005','DRH-EV-006','DRH-EV-007','DRH-EV-008','DRH-EV-009','DRH-EV-010','DRH-EV-011','DRH-EV-012','DRH-EV-013','DRH-EV-014','DRH-CO-001','DRH-CO-002','DRH-CO-003','DRH-CO-004','DRH-CO-005','DRH-CO-006','DRH-CO-007','DRH-CO-008','DRH-CO-009','DRH-CO-010','DRH-CO-011','DRH-CO-012','DRH-CO-013','DRH-CO-014','DRH-NA-001','DRH-WA-001','DRH-WA-002','DRH-CO-015','DRH-CO-016','FWC-TM-001','FWH-EV-001','FWH-CO-001','FWH-CO-002','FWH-CO-003','FWH-CO-004','FWH-CO-005','FWH-CO-006','FWH-CO-007','UTH-EV-001','UTH-EV-002','UTH-EV-003','WDH-EV-001','WDH-EV-002','WDH-EV-003','WDH-EV-004','HC-CO-001','HC-CO-002','HC-CO-003','HC-CO-004','HC-CO-005','HC-CO-006','HC-EV-001','HC-EV-002','HC-EV-003','HC-EV-004','HC-WA-001','HC-MX-001','WR-WA-001','WR-CO-001','BL-AC-001','BL-AC-002','BL-AC-003','BL-AC-004','BL-AC-007','BL-AC-008','BL-AC-009','BL-AC-010','BL-AC-011','BL-AC-012','BL-AC-013','BL-AC-014','BL-AC-015','BL-BS-001','BL-BS-002','BL-BS-003','BL-BS-004','BL-BS-005','BL-BS-006','BL-DL-001','BL-DL-002','BL-DL-003','BL-DL-004','SF-SG-001','SF-SG-002','SF-SG-003','SF-DT-001','SF-DT-002','SF-DT-003','SF-DT-004','SF-DT-005','SF-DT-006','SF-OL-001','SF-CT-001','SL-WK-001','SL-WK-002','SL-WK-003','SL-WK-004','SL-WK-005','SL-WK-008','SL-CO-001','SL-CO-002','SL-WK-009','SL-WK-010','SL-MZ-001','SL-EV-001','SL-WA-001','SL-EB-001','WT-CO-001','WT-CO-002','WT-CO-003','WT-CO-004','WT-CO-005','WT-CO-006','WT-CO-007','WT-CO-008','GC-HL-002') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-03-31' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-03-27 15:00:00+09'::timestamptz, counted_by_name='谷川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('GR-IO-046') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-03-31' and deleted_at is null) and t.item_id=i.id;

-- 2026-04-30 棚卸（315品番 / 前月から 消滅41・変化28）
insert into inv_count_sessions (company_id,store_id,counted_on,label,status,closed_at,note) values ('ec00ad2a-4032-4061-bdb7-03face8a04e7','82bb4e18-427d-4cc7-a834-c9e2a9b18199','2026-04-30','2026年4月末 棚卸','closed','2026-04-30 23:59:59+09','エクセル(202606_ゴルフウィング在庫リスト.xlsm)からの移行分。当時は入出庫台帳が無く理論在庫が存在しないため theoretical/diff は null') on conflict do nothing;
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null),c.item_id,c.qty,'2026-04-30 15:30:00+09'::timestamptz,'谷川' from inv_counts c where c.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-03-31' and deleted_at is null)
on conflict (session_id,item_id) do nothing;
delete from inv_counts where session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and item_id in (select id from inv_items where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and code in ('BL-AC-001','BL-AC-002','BL-AC-007','BL-BS-005','BL-DL-001','BL-DL-002','BL-DL-003','BL-DL-004','DRC-CA-002','DRH-CO-001','DRH-CO-002','DRH-CO-003','DRH-CO-004','DRH-CO-005','DRH-CO-006','DRH-CO-007','DRH-CO-008','DRH-CO-009','DRH-CO-010','DRH-CO-011','DRH-CO-012','DRH-EV-011','DRH-EV-014','DRH-WA-002','FWH-CO-001','FWH-CO-002','FWH-CO-003','FWH-CO-004','FWH-CO-005','FWH-CO-006','FWH-CO-007','GC-HL-002','HC-CO-001','HC-CO-002','HC-CO-003','HC-CO-004','HC-CO-005','HC-CO-006','UTH-EV-002','UTH-EV-003','WR-WA-001'));
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null),i.id,v.q,'2026-04-30 15:30:00+09'::timestamptz,'谷川' from (values ('GL-IS-012',3),('GR-IO-014',10),('GR-PP-021',13)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c and i.deleted_at is null
on conflict (session_id,item_id) do update set qty=excluded.qty;
update inv_counts t set qty=v.q from (values ('BL-AC-004',8),('BL-AC-014',1),('BL-BS-001',1),('GL-IS-004',0),('GL-IS-005',3),('GL-IS-006',6),('GL-IS-007',4),('GL-IS-011',4),('GL-IS-019',2),('GR-EL-006',11),('GR-EL-007',8),('GR-EL-008',7),('GR-EL-013',4),('GR-EL-016',8),('GR-EL-017',7),('GR-EL-018',4),('GR-GP-008',9),('GR-IO-008',4),('GR-IO-013',8),('GR-IO-031',2),('GR-IO-039',2),('GR-PP-012',4),('GR-PP-015',3),('PG-IO-001',0),('SL-MZ-001',3),('SL-WK-008',2),('SL-WK-009',2),('SL-WK-010',3)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c where t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-04-30 17:00:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('DRC-TM-001','DRC-CA-001','DRH-EV-001','DRH-EV-002','DRH-EV-003','DRH-EV-004','DRH-EV-005','DRH-EV-006','DRH-EV-007','DRH-EV-008','DRH-EV-009','DRH-EV-010','DRH-EV-012','DRH-EV-013','DRH-CO-013','DRH-CO-014','DRH-NA-001','DRH-WA-001','DRH-CO-015','DRH-CO-016','FWC-TM-001','FWH-EV-001','UTH-EV-001','WDH-EV-001','WDH-EV-002','WDH-EV-003','WDH-EV-004','HC-EV-001','HC-EV-002','HC-EV-003','HC-EV-004','HC-WA-001','HC-MX-001','WR-CO-001','BL-AC-003','BL-AC-004','BL-AC-008','BL-AC-009','BL-AC-010','BL-AC-011','BL-AC-012','BL-AC-013','BL-AC-014','BL-AC-015','BL-BS-001','BL-BS-002','BL-BS-003','BL-BS-004','BL-BS-006','SF-SG-001','SF-SG-002','SF-SG-003','SF-DT-001','SF-DT-002','SF-DT-003','SF-DT-004','SF-DT-005','SF-DT-006','SF-OL-001','SF-CT-001','WT-CO-001','WT-CO-002','WT-CO-003','WT-CO-004','WT-CO-005','WT-CO-006','WT-CO-007','WT-CO-008') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-05-01 19:00:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('SL-WK-001') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-05-01 20:00:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('SL-WK-002') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-05-01 21:00:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('SL-WK-003') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-05-01 22:00:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('SL-WK-004') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-05-01 23:00:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('SL-WK-005') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-05-01 12:00:00+09'::timestamptz, counted_by_name='古川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('SL-WK-008','SL-CO-001','SL-CO-002','SL-WK-009','SL-WK-010','SL-MZ-001','SL-EV-001','SL-WA-001','SL-EB-001') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null) and t.item_id=i.id;

-- 2026-05-31 棚卸（267品番 / 前月から 消滅55・変化62）
insert into inv_count_sessions (company_id,store_id,counted_on,label,status,closed_at,note) values ('ec00ad2a-4032-4061-bdb7-03face8a04e7','82bb4e18-427d-4cc7-a834-c9e2a9b18199','2026-05-31','2026年5月末 棚卸','closed','2026-05-31 23:59:59+09','エクセル(202606_ゴルフウィング在庫リスト.xlsm)からの移行分。当時は入出庫台帳が無く理論在庫が存在しないため theoretical/diff は null') on conflict do nothing;
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-05-31' and deleted_at is null),c.item_id,c.qty,'2026-06-01 15:00:00+09'::timestamptz,'小川' from inv_counts c where c.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-04-30' and deleted_at is null)
on conflict (session_id,item_id) do nothing;
delete from inv_counts where session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-05-31' and deleted_at is null) and item_id in (select id from inv_items where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and code in ('GL-FL-002','GL-FL-003','GL-FL-012','GL-IO-002','GL-IO-003','GL-IO-005','GL-IO-006','GL-IS-002','GR-GP-003','GR-GP-012','GR-IO-011','GR-IO-012','GR-IO-016','GR-IO-017','GR-IO-018','GR-IO-032','GR-IO-042','GR-IO-048','GR-IO-050','GR-PP-005','GR-PP-009','GR-PP-010','GR-PP-011','GR-PP-013','GR-PP-014','GR-PP-020','PG-EL-001','PG-EL-004','PG-EL-006','PG-EL-007','PG-EL-008','PG-EL-012','PG-EL-014','PG-IO-002','PG-IO-006','PG-LM-001','PG-SS-001','PG-SS-002','PG-SS-005','PR-EL-002','PR-EL-003','PR-EL-004','PR-LT-002','PS-EL-001','RW-EL-002','SL-WA-001','SL-WK-004','TE-US-001','TE-US-002','TE-US-003','TE-US-004','TE-US-005','TE-US-006','TE-US-007','TE-US-010'));
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-05-31' and deleted_at is null),i.id,v.q,'2026-06-01 15:00:00+09'::timestamptz,'小川' from (values ('BL-AC-005',6),('BL-AC-006',5),('GC-HL-001',3),('GC-HL-002',8),('GR-IO-015',4),('SL-WK-006',2),('SL-WK-007',3)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c and i.deleted_at is null
on conflict (session_id,item_id) do update set qty=excluded.qty;
update inv_counts t set qty=v.q from (values ('BL-AC-003',0),('BL-AC-004',4),('BL-AC-008',0),('BL-AC-009',0),('BL-AC-010',3),('BL-AC-015',4),('BL-BS-001',5),('BL-BS-003',5),('BL-BS-004',2),('GL-FL-009',2),('GL-FL-010',3),('GL-IS-003',1),('GL-IS-004',10),('GL-IS-005',1),('GL-IS-006',1),('GL-IS-007',1),('GL-IS-008',3),('GL-IS-011',2),('GL-IS-012',1),('GL-IS-013',2),('GL-IS-014',4),('GL-IS-015',3),('GL-IS-016',4),('GL-IS-018',2),('GR-EL-005',8),('GR-EL-010',2),('GR-EL-011',9),('GR-EL-013',5),('GR-EL-015',6),('GR-EL-016',13),('GR-EL-025',9),('GR-EL-026',8),('GR-GP-001',34),('GR-GP-005',10),('GR-GP-007',7),('GR-GP-008',31),('GR-GP-009',9),('GR-GP-010',14),('GR-IO-001',24),('GR-IO-007',5),('GR-IO-008',0),('GR-IO-009',9),('GR-IO-010',13),('GR-IO-013',5),('GR-IO-014',0),('GR-IO-021',9),('GR-IO-030',0),('GR-IO-031',3),('GR-IO-036',9),('GR-IO-039',3),('GR-IO-044',7),('GR-IO-045',2),('GR-IO-046',3),('GR-IO-047',10),('GR-PP-003',9),('SF-DT-005',0),('SL-WK-005',0),('SL-WK-008',3),('SL-WK-009',4),('SL-WK-010',4),('TE-US-008',0),('TE-US-009',0)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c where t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-05-31' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-06-02 16:00:00+09'::timestamptz, counted_by_name='小川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('BL-AC-005') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-05-31' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-06-03 17:00:00+09'::timestamptz, counted_by_name='小川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('BL-AC-006') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-05-31' and deleted_at is null) and t.item_id=i.id;

-- 2026-06-30 棚卸（304品番 / 前月から 消滅13・変化38）
insert into inv_count_sessions (company_id,store_id,counted_on,label,status,closed_at,note) values ('ec00ad2a-4032-4061-bdb7-03face8a04e7','82bb4e18-427d-4cc7-a834-c9e2a9b18199','2026-06-30','2026年6月末 棚卸','closed','2026-06-30 23:59:59+09','エクセル(202606_ゴルフウィング在庫リスト.xlsm)からの移行分。当時は入出庫台帳が無く理論在庫が存在しないため theoretical/diff は null') on conflict do nothing;
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null),c.item_id,c.qty,'2026-06-25 14:00:00+09'::timestamptz,'谷川' from inv_counts c where c.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-05-31' and deleted_at is null)
on conflict (session_id,item_id) do nothing;
delete from inv_counts where session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null) and item_id in (select id from inv_items where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and code in ('BL-AC-003','BL-AC-008','BL-AC-009','DRH-CO-013','DRH-CO-014','DRH-NA-001','SL-WK-001','SL-WK-002','SL-WK-003','SL-WK-005','SL-WK-006','SL-WK-007','SL-WK-008'));
insert into inv_counts (company_id,session_id,item_id,qty,counted_at,counted_by_name)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7',(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null),i.id,v.q,'2026-06-25 14:00:00+09'::timestamptz,'谷川' from (values ('GL-FL-002',0),('GL-FL-003',0),('GL-FL-012',0),('GL-IO-002',0),('GL-IO-003',0),('GL-IO-005',0),('GL-IO-006',0),('GL-IS-002',4),('GR-GP-003',0),('GR-GP-012',0),('GR-IO-011',0),('GR-IO-012',0),('GR-IO-016',0),('GR-IO-017',0),('GR-IO-018',0),('GR-IO-032',0),('GR-IO-042',0),('GR-IO-048',0),('GR-IO-050',0),('GR-PP-005',0),('GR-PP-009',0),('GR-PP-010',0),('GR-PP-011',0),('GR-PP-013',0),('GR-PP-014',0),('GR-PP-020',0),('PG-EL-001',0),('PG-EL-004',0),('PG-EL-006',0),('PG-EL-007',0),('PG-EL-008',0),('PG-EL-012',0),('PG-EL-014',0),('PG-IO-002',0),('PG-LM-001',0),('PG-SS-005',0),('PR-EL-002',0),('PR-EL-003',0),('PR-EL-004',0),('PR-LT-002',0),('PS-EL-001',0),('RW-EL-002',0),('TE-US-001',0),('TE-US-002',0),('TE-US-003',0),('TE-US-004',0),('TE-US-005',0),('TE-US-006',0),('TE-US-007',0),('TE-US-010',0)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c and i.deleted_at is null
on conflict (session_id,item_id) do update set qty=excluded.qty;
update inv_counts t set qty=v.q from (values ('BL-AC-015',3),('DRH-WA-001',0),('GL-FL-009',3),('GL-FL-010',5),('GL-IS-001',4),('GL-IS-003',6),('GL-IS-004',14),('GL-IS-005',8),('GL-IS-006',3),('GL-IS-007',3),('GL-IS-008',6),('GL-IS-009',5),('GL-IS-011',4),('GL-IS-012',2),('GL-IS-013',3),('GL-IS-014',1),('GL-IS-015',1),('GL-IS-016',1),('GL-IS-018',6),('GR-EL-015',13),('GR-EL-016',6),('GR-EL-017',4),('GR-GP-002',16),('GR-GP-006',3),('GR-GP-008',20),('GR-GP-011',9),('GR-IO-002',4),('GR-IO-003',43),('GR-IO-005',17),('GR-IO-007',20),('GR-IO-013',3),('GR-IO-021',8),('GR-IO-029',5),('GR-IO-031',2),('GR-IO-045',3),('GR-IO-046',0),('GR-IO-047',15),('GR-ST-004',13)) v(c,q)
join inv_items i on i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code=v.c where t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-06-30 17:00:00+09'::timestamptz, counted_by_name='小川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('DRC-TM-001','DRC-CA-001','DRH-EV-001','DRH-EV-002','DRH-EV-003','DRH-EV-004','DRH-EV-005','DRH-EV-006','DRH-EV-007','DRH-EV-008','DRH-EV-009','DRH-EV-010','DRH-EV-012','DRH-EV-013','DRH-CO-015','DRH-CO-016','FWC-TM-001','FWH-EV-001','UTH-EV-001','WDH-EV-001','WDH-EV-002','WDH-EV-003','WDH-EV-004','HC-EV-001','HC-EV-002','HC-EV-003','HC-EV-004','HC-WA-001','HC-MX-001','WR-CO-001','BL-AC-004','BL-AC-005','BL-AC-006','BL-AC-010','BL-AC-011','BL-AC-012','BL-AC-013','BL-AC-014','BL-AC-015','BL-BS-001','BL-BS-002','BL-BS-003','BL-BS-004','BL-BS-006','SF-SG-001','SF-SG-002','SF-SG-003','SF-DT-001','SF-DT-002','SF-DT-003','SF-DT-004','SF-DT-006','SF-OL-001','SF-CT-001','SL-CO-001','SL-CO-002','SL-WK-009','SL-WK-010','SL-MZ-001','SL-EV-001','SL-EB-001','WT-CO-001','WT-CO-002','WT-CO-003','WT-CO-004','WT-CO-005','WT-CO-006','WT-CO-007','WT-CO-008','GC-HL-001','GC-HL-002') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-06-30 17:00:00+09'::timestamptz, counted_by_name=null from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('DRH-WA-001') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-06-30 12:00:00+09'::timestamptz, counted_by_name='小川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('SF-DT-005') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-06-30 12:00:00+09'::timestamptz, counted_by_name=null from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('GR-IO-011','GR-IO-012','GR-IO-014','GR-IO-016','GR-IO-017','GR-IO-018','GR-IO-032','GR-IO-042','GR-IO-048','GR-IO-050','GR-PP-005','GR-PP-009','GR-PP-010','GR-PP-011','GR-PP-013','GR-PP-014','GR-PP-020','GR-GP-003','GR-GP-012','PG-SS-005','PG-LM-001','PG-EL-001','PG-EL-004','PG-EL-006','PG-EL-007','PG-EL-008','PG-EL-012','PG-EL-014','PG-IO-001','PG-IO-002','GL-IO-002','GL-IO-003','GL-IO-005','GL-IO-006','GL-FL-002','GL-FL-003','GL-FL-012','PR-EL-002','PR-EL-003','PR-EL-004','PR-LT-002','PS-EL-001','RW-EL-002','TE-US-001','TE-US-002','TE-US-003','TE-US-004','TE-US-005','TE-US-006','TE-US-007','TE-US-008','TE-US-009','TE-US-010') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null) and t.item_id=i.id;
update inv_counts t set counted_at='2026-06-26 12:00:00+09'::timestamptz, counted_by_name='谷川' from inv_items i
where i.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and i.code in ('GR-EL-001','GR-EL-002','GR-EL-003','GR-EL-004','GR-EL-005','GR-EL-006','GR-EL-007','GR-EL-008','GR-EL-009','GR-EL-010','GR-EL-011','GR-EL-012','GR-EL-013','GR-EL-014','GR-EL-015','GR-EL-016','GR-EL-017','GR-EL-018','GR-EL-019','GR-EL-020','GR-EL-021','GR-EL-022','GR-EL-023','GR-EL-024','GR-EL-025','GR-EL-026','GR-EL-027','GR-EL-028','GR-EL-029','GR-EL-030','PG-SS-003','PG-SS-004','PG-EL-002','PG-EL-003','PG-EL-005','PG-EL-009','PG-EL-010','PG-EL-011','PG-EL-013','PG-IO-003','PG-IO-004','PG-IO-005') and t.session_id=(select id from inv_count_sessions where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and counted_on='2026-06-30' and deleted_at is null) and t.item_id=i.id;

-- 集計値の確定（inv_close_count は通さない＝過去分に adjust を起票しない）
update inv_count_sessions s set total_qty=agg.qty, total_value=agg.val, updated_at=now()
from (select c.session_id, sum(c.qty) qty, sum(c.qty*coalesce(i.cost_price,0)) val
      from inv_counts c join inv_items i on i.id=c.item_id group by c.session_id) agg
where agg.session_id=s.id and s.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7';

-- 検証: 原本の 品番数 / 合計数量 と一致すること
-- 2025-12-31:339件1163点 | 2026-01-31:339件1191点 | 2026-02-28:342件1200点 | 2026-03-31:353件1251点 | 2026-04-30:315件1243点 | 2026-05-31:267件1241点 | 2026-06-30:304件1259点
