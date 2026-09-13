-- 0177_craft_os_sleeve_price_5000.sql
-- スリーブの定価を全て 5,000円（税抜）に統一する。（2026-09-13 ユーザー指示・適用済み）
--
-- 変更前: 2,250円（6品）／2,600円（6品）でメーカーごとにバラバラだった。
-- 対象は item_category='スリーブ' の12品のみ。
-- 「ウッド用 ソケット」「アイアン用 ソケット」（計45品）は別物なので触らない。
-- 工賃の「スリーブ装着」「スリーブ外し」も別物なので触らない。
--
-- ⚠ 定価の正典は商品マスタ。既に出した見積の金額は gw_quote_items.list_price に
--   写し取ってあるので、この変更で過去の見積の金額は動かない。

update golfwing.products
set list_price = 5000, updated_at = now()
where company_id = 'ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and item_category = 'スリーブ';
