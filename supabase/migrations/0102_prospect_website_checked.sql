-- 0102: 「ホームページが無い」と「まだ確認していない」を分ける（#119）
--
-- #116で「HPが無い先=95点(最優先)」としたが、名簿巡回は visit_detail=false のとき
-- 公式サイトURLを一度も探していない。にもかかわらず website_url が null というだけで
-- 100件の医院が一律95点＝最優先になり、実際にHPを持っている先に
-- 「ホームページが見当たりません」と営業する寸前だった（2026-08-07の実障害）。
--
-- 列を足して「確認したか」を記録する。確認していない先は採点しない＝
-- 嘘の最優先を作らない。既定 false は「確認していない」＝安全側。
alter table public.dms_prospects
  add column if not exists website_checked boolean not null default false;

comment on column public.dms_prospects.website_checked is
  '公式サイトの有無を実際に調べたか。false=未確認（website_url が null でも「HPなし」と断定してはいけない）';

-- 既にサイトURLが入っている行は、確認済みとみなしてよい
update public.dms_prospects set website_checked = true where website_url is not null;

-- Places由来はAPIが websiteUri を返すか返さないかで「有無」を答えている＝確認済み
update public.dms_prospects p set website_checked = true
  from public.prs_sources s
 where s.id = p.prs_source_id and s.kind = 'places' and p.website_checked = false;

-- 未確認のまま「HPなし95点」で採点された行を取り消す（再採点の対象に戻す）
update public.dms_prospects
   set audited_at = null,
       score = null,
       status = 'unanalyzed',
       auto_demo_at = null,
       analysis = null,
       audit = null,
       good_points = null,
       improve_points = null
 where deleted_at is null
   and website_url is null
   and website_checked = false
   and audited_at is not null;

-- その誤った採点から自動生成されたデモも取り消す
update public.dms_demos d set deleted_at = now()
  from public.dms_prospects p
 where p.id = d.prospect_id and d.deleted_at is null
   and p.website_checked = false and p.website_url is null;
