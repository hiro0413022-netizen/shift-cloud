-- 0201: グリップ価格表（2026-09-24 ユーザー提供）から未登録の商品を追加し、
--       パターグリップを独立した区分にする（#275）
--
-- ユーザーの決定（2026-09-24）:
--   1. 既存の金額は触らない（「金額は現在のものでダイジョブです」）。
--      追加するのは、いただいた表にあって商品マスタに無かったものだけ。
--   2. 色では分けない。型番1つにつき1行（「型番だけ」）。
--      表はコーラルレッド・ブルーのように色ごとに行があるが、同じ型番なら値段は同じ。
--      色は見積の行で手打ちして足せる。
--   3. パターグリップは会員割引なし → 区分を「パターグリップ」に分け、掛け率1.00のルールを1つ置く。
--      （割引ルールは 区分×メーカー×属性 で効くので、商品ごとの例外は作れない）
--
-- 出所は source 列に残す。あとで「この値段どこから来た？」に答えられるようにするため。

-- ---------------------------------------------------------------
-- 1. パターグリップを独立区分へ（既存55件）
-- ---------------------------------------------------------------
update golfwing.products
set item_category = 'パターグリップ', updated_at = now()
where is_active and item_category = 'グリップ'
  and (name ilike '%パター%' or name ilike '%putter%' or name ilike '%PT%'
       or name ilike '%Claw%' or name ilike '%Flatso%' or name ilike '%Wristlock%' or name ilike '%SS2R%'
       or name ilike '%Twin stroke%'
       or (manufacturer = 'スーパーストローク' and name ilike 'ZENERGY%'));

-- 掛け率: パターグリップは会員でも割引なし（表の「会員割引なし」）
insert into public.gw_discount_rules (company_id, item_category, manufacturer, segment, member_kind, rate, priority, note, effective_from, is_active)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7'::uuid, 'パターグリップ', null, null, null, 1.0000, 0,
       'パターグリップは会員割引なし（2026-09-24 グリップ価格表・ユーザー確認）', '2026-09-24', true
where not exists (select 1 from public.gw_discount_rules where item_category = 'パターグリップ');

-- ---------------------------------------------------------------
-- 2. 未登録の商品を追加（表にあってマスタに無かったもの）
-- ---------------------------------------------------------------
insert into golfwing.products (item_category, manufacturer, name, list_price, unit, source, is_active)
select v.cat, v.maker, v.name, v.price, '本', 'グリップ価格表 2026-09（ユーザー提供）', true
from (values
  -- ── グリップ ──
  ('グリップ', 'iomic',          'X-Grip 2.3 松山英樹モデル',   19500),
  ('グリップ', 'iomic',          'iXx cord 2.3',                 1700),
  ('グリップ', 'PERFECT PRO',    'X HOLD BLACK RUBBER',          1800),
  ('グリップ', 'PERFECT PRO',    'X HOLD BLACK HALF CORD',       2000),
  ('グリップ', 'PERFECT PRO',    'X HOLD BLACK CORD',            2000),
  ('グリップ', 'PERFECT PRO',    'X LINE RUBBER',                1700),
  ('グリップ', 'PERFECT PRO',    'X SOFT LADIE''S',              1700),
  ('グリップ', 'CADERO',         '2x2 PENTAGON スター入り',      2400),
  ('グリップ', 'CADERO',         '2x2 PTG DUO For LADY',         2500),
  ('グリップ', 'STM',            'S-1 PROTO TYPE',               2000),
  ('グリップ', 'STM',            'M-3 LIGHT',                    1300),
  ('グリップ', 'STM',            'T-1 セミミッド',               1450),
  ('グリップ', 'STM',            'S-1 Light',                    1800),
  ('グリップ', 'STM',            'G-Rex',                        1760),
  ('グリップ', 'LIFATH',         'IMS 1.8',                      1400),
  ('グリップ', 'LIFATH',         'INNOV M60',                    1400),
  ('グリップ', 'ゴルフプライド', 'ツアーベルベット 360 LITE',    1600),
  -- ── パターグリップ ──
  ('パターグリップ', 'iomic',          'Putter Grip Regular',        3100),
  ('パターグリップ', 'iomic',          'Putter Grip Mid',            3100),
  ('パターグリップ', 'iomic',          'Putter Grip Large',          3600),
  ('パターグリップ', 'iomic',          'I-Crassic Putter Regular',   3100),
  ('パターグリップ', 'iomic',          'I-Crassic MID Putter',       3600),
  ('パターグリップ', 'ゴルフプライド', 'TOUR SNSR STRAIGHT 140cc',   3000),
  ('パターグリップ', 'ゴルフプライド', 'TOUR SNSR CONTOUR 104cc',    3000),
  ('パターグリップ', 'ゴルフプライド', 'TOUR SNSR CONTOUR 140cc',    3000),
  ('パターグリップ', 'ゴルフプライド', 'TOUR SNSR CONTOUR PRO 104cc',3000),
  ('パターグリップ', 'ゴルフプライド', 'TOUR SNSR CONTOUR PRO 140cc',3000),
  ('パターグリップ', 'エリートグリップ', 'うまい棒 たこ焼き味',       3800),
  ('パターグリップ', 'エリートグリップ', 'うまい棒 チーズ味',         3800),
  ('パターグリップ', 'エリートグリップ', 'うまい棒 コーンポタージュ味', 3800),
  ('パターグリップ', 'エリートグリップ', 'うまい棒 めんたいこ味',     3800),
  ('パターグリップ', 'LAMKIN',         'SINK FIT PISTOL 63g',        3800),
  ('パターグリップ', 'LAMKIN',         'SINK FIT PISTOL 120g',       3800),
  ('パターグリップ', 'スーパーストローク', 'TRAXION TOUR 2.0',        5000),
  ('パターグリップ', 'スーパーストローク', 'Zenergy Pistol GT 1.0',   5500),
  ('パターグリップ', 'スーパーストローク', 'Zenergy Pistol GT 2.0',   5500),
  -- ── スリーブ（表の「スリーブ価格」から、マスタに無かったもの）──
  ('スリーブ', '非純正', 'バルド用',            4000),
  ('スリーブ', '非純正', 'XXIO・スリクソン用',  5000),
  ('スリーブ', '非純正', 'ピン G410 UT',        5500)
) as v(cat, maker, name, price)
where not exists (
  select 1 from golfwing.products p
  where p.is_active and p.manufacturer = v.maker
    and lower(replace(p.name, ' ', '')) = lower(replace(v.name, ' ', ''))
);
