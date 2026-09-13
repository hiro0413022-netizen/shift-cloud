-- 0170_craft_os_demo_shaft_matching.sql
-- 試打シャフト台帳の未紐づけ123本を片づける。（2026-09-13 適用済み）
--
--  A. Excel の略記を商品マスタの正式名に突き合わせる（38本）
--     例) VENTUS TR RD 5 R → 26 VENTUS TR RED 5R ／ VENTUS HB BLUE 6 R → VENTUS BLUE HB 6 R
--         DIAMOND SPEEDER 3 R（DR・60,000円）→ NEW DIAMOND SPEEDER 3 R
--     いずれも 商品名・番手・定価 が一致する商品がマスタに1件だけある組み合わせに限る。
--
--  B. そもそも商品マスタに無いもの（ワクチンコンポ／muziik／SPEEDER NX GREEN）を
--     試打台帳（01_試打シャフト表紙.xlsm）の内容で商品マスタに登録し、紐づける。（56商品）
--     定価は台帳の値。廃盤のものは is_active=false で入れる（発注には出さないが見積では引ける）。
--     仕入掛け率(default_rate)は台帳に無いので入れない＝スタッフ購入価格は出ない。
--
--  C. 残り17本は「候補つきの要確認」として /demo-shafts に残す。人が選ぶべきもの。
--
-- ⚠ 定価の正典は商品マスタ。台帳の定価は登録時の初期値としてしか使わない。
-- ⚠ 実際の適用は Supabase MCP で行った。このファイルは記録。

-- ── A. 略記の突き合わせ ───────────────────────────────────────────────
with d as (
  select id, demo_no, club_type,
         regexp_replace(btrim(replace(import_name,'　',' ')), '\s+', ' ', 'g') as nm
  from public.gw_demo_shafts
  where company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and match_status <> 'matched'
), tgt as (
  select d.id, d.club_type,
    case
      when d.nm ~ '^VENTUS TR (RD|BK) [0-9]+ [A-Za-z0-9]+$'
        then '26 VENTUS TR ' || case substring(d.nm from '^VENTUS TR (RD|BK)') when 'RD' then 'RED' else 'BLACK' end
      when d.nm ~ '^VENTUS HB [A-Za-z]+ [0-9]+ [A-Za-z0-9]+$'
        then regexp_replace(d.nm, '^VENTUS HB ([A-Za-z]+) ([0-9]+) ([A-Za-z0-9]+)$', 'VENTUS \1 HB \2 \3')
      when d.nm ~ '^DIAMOND SPEEDER FW [0-9]+ ?[A-Za-z0-9]+$'
        then regexp_replace(d.nm, '^DIAMOND SPEEDER FW ([0-9]+) ?([A-Za-z0-9]+)$', 'NEW DIAMOND SPEEDER FW \1 \2')
      when d.nm ~ '^DIAMOND SPEEDER [0-9]+ [A-Za-z0-9]+$' and d.club_type='FW'
        then regexp_replace(d.nm, '^DIAMOND SPEEDER ([0-9]+) ([A-Za-z0-9]+)$', 'NEW DIAMOND SPEEDER FW \1 \2')
      when d.nm ~ '^DIAMOND SPEEDER [0-9]+ [A-Za-z0-9]+$' and d.club_type='DR'
        then regexp_replace(d.nm, '^DIAMOND SPEEDER ([0-9]+) ([A-Za-z0-9]+)$', 'NEW DIAMOND SPEEDER \1 \2')
      when d.demo_no = 1290 then 'Air Speeder  standard'
      when d.demo_no = 1292 then 'AIR SPEEDER STANDARD'
    end as want_name,
    case when d.nm ~ '^VENTUS TR (RD|BK) [0-9]+ [A-Za-z0-9]+$'
         then regexp_replace(d.nm, '^VENTUS TR (RD|BK) ([0-9]+) ([A-Za-z0-9]+)$', '\2\3') end as want_spec
  from d
), hit as (
  select t.id, p.id as product_id, p.name as pname
  from tgt t
  join public.gw_products p
    on p.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7'
   and golfwing.norm_name(p.name) = golfwing.norm_name(t.want_name)
   and coalesce(golfwing.norm_name(p.spec),'') = coalesce(golfwing.norm_name(t.want_spec),'')
   and p.club_type = t.club_type
  where t.want_name is not null
)
update public.gw_demo_shafts s
set product_id = h.product_id,
    match_status = 'matched',
    match_note = 'Excelの略記から突き合わせ（2026-09-13）→ ' || h.pname,
    updated_at = now()
from hit h where s.id = h.id;

-- ── B. 商品マスタに無いものを登録して紐づける ─────────────────────────
create temporary table _reg on commit drop as
select
  d.id as shaft_id,
  d.import_maker as maker,
  btrim(regexp_replace(
    regexp_replace(regexp_replace(btrim(replace(d.import_name,'　',' ')), '\s+',' ','g'),
                   '\s*[（(](廃盤|在庫限り|製造終了|色確認|工房内現品確認|廃盤、工房内現品確認)[）)]\s*', ' ', 'g'),
    '\s+',' ','g')) as clean_name,
  case when d.import_name ~* '(^| )UT( |$)' then 'UT'
       when d.import_name ~* '(^| )FW( |$)' then 'FW'
       when d.import_name ~* '(^| )DR( |$)' then 'DR'
       else d.club_type end as ct,
  d.import_price as price,
  (d.status = '廃盤') as haiban
from public.gw_demo_shafts d
where d.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7' and d.match_status <> 'matched'
  and (d.import_maker in ('グラヴィティ','muziik') or d.import_name ilike 'SPD NX GREEN%');

insert into golfwing.products (company_id, item_category, manufacturer, name, club_type, list_price, unit, source, is_active)
select 'ec00ad2a-4032-4061-bdb7-03face8a04e7'::uuid, 'シャフト', r.maker, r.clean_name, r.ct,
       max(r.price), '本',
       '試打シャフト台帳（01_試打シャフト表紙.xlsm）より登録 2026-09-13',
       not bool_and(r.haiban)
from _reg r
group by r.maker, r.clean_name, r.ct
on conflict do nothing;

update public.gw_demo_shafts s
set product_id = p.id,
    match_status = 'matched',
    match_note = '商品マスタに無かったため試打台帳の内容で登録（2026-09-13）',
    updated_at = now()
from _reg r
join golfwing.products p
  on p.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7'
 and p.name = r.clean_name
 and p.club_type is not distinct from r.ct
 and p.source = '試打シャフト台帳（01_試打シャフト表紙.xlsm）より登録 2026-09-13'
where s.id = r.shaft_id;

-- ── C. 残りに候補を書いておく（人が /demo-shafts で選ぶ）──────────────
update public.gw_demo_shafts s
set match_status = 'needs_review',
    match_note = '色の指定が無い。候補: 26 VENTUS TR BLUE（同じ番手が揃っている）。RD/BKは別番号で登録済み',
    updated_at = now()
where s.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and s.match_status = 'unmatched'
  and regexp_replace(btrim(replace(s.import_name,'　',' ')), '\s+',' ','g') ~ '^VENTUS TR [0-9]+[A-Za-z]+$';

update public.gw_demo_shafts s
set match_status = 'needs_review',
    match_note = '候補: TENSEI 1K Pro Orange RIP+（同価格・同番手）。別モデルの可能性があるため要確認',
    updated_at = now()
where s.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and s.match_status = 'unmatched'
  and s.import_name ilike 'TENSEI PRO ORANGE 1K%';

update public.gw_demo_shafts s
set match_status = 'needs_review',
    match_note = '候補: AIR SPEEDER PLUS（45,000円で一致）。無印 Air Speeder standard は50,000円なので別物',
    updated_at = now()
where s.company_id='ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and s.match_status = 'unmatched'
  and s.demo_no = 530;
