-- 0202: スリーブ装着の持ち込み工賃を500円に／価格が空欄だった3点を登録（#276・2026-09-24）
--
-- ユーザー確認（2026-09-24）:
--   1. 工賃「スリーブ装着（持ち込みのみ）500円」＝価格表どおりに直す。
--      0201 の時点では price_bring_in=0 で、登録時から「見積のルールとグリップシートで食い違う・要確認」
--      と注記が残っていた。ユーザーが価格表を出して「直す」と決めたので、その注記ごと解消する。
--   2. 価格が空欄だった3点は 5,500円。
--   3. IOMIC の Putter Grip Mid / Large は既存の Sticky Mid 4.4・Jumbo 5.5 とは別物（0201 のままでよい）。
--   4. ウェイトとレンチは登録しない。

update public.gw_labor_rates
set price_bring_in = 500,
    price_note = '持ち込みは500円（2026-09-24 グリップ価格表・ユーザー確認）',
    updated_at = now()
where code = 'sleeve_mount';

insert into golfwing.products (item_category, manufacturer, name, list_price, unit, source, is_active)
select v.cat, v.maker, v.name, v.price, '本', 'グリップ価格表 2026-09（ユーザー提供・価格は2026-09-24に確認）', true
from (values
  ('パターグリップ', 'ゴルフプライド',     'TOUR SNSR STRAIGHT 104cc', 5500),
  ('パターグリップ', 'LAMKIN',             'SINK FIT STRAIGHT 114g',   5500),
  ('パターグリップ', 'スーパーストローク', 'ハイビス MID SLIM 2.0',    5500)
) as v(cat, maker, name, price)
where not exists (
  select 1 from golfwing.products p
  where p.is_active and p.manufacturer = v.maker
    and lower(replace(p.name, ' ', '')) = lower(replace(v.name, ' ', ''))
);
