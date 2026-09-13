-- 0171_craft_os_waccine_maker_name.sql
-- ワクチンコンポのメーカー名を割引率表に合わせる。（2026-09-13 適用済み）
--
-- 試打台帳（Excel）のメーカー欄は「グラヴィティ」（会社名）だが、
-- シャフト割引率表は「ワクチンコンポ」（ブランド名）で -15/-25/-5% を持っている。
-- 0169 で台帳のままの「グラヴィティ」で登録してしまうと、割引率表に当たらず
-- 通常のシャフト率（-20/-30/-10%）で見積が出てしまう＝実際より安く出す。
-- 商品マスタ側をブランド名に合わせる。

update golfwing.products
set manufacturer = 'ワクチンコンポ', updated_at = now()
where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and manufacturer = 'グラヴィティ'
  and source = '試打シャフト台帳（01_試打シャフト表紙.xlsm）より登録 2026-09-13';

update public.gw_discount_rules
set note = '割引率表に記載。2026-09-13に商品マスタへ登録済み（試打台帳より／会社名はグラヴィティ）',
    updated_at = now()
where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and manufacturer = 'ワクチンコンポ';
