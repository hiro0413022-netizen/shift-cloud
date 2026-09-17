-- 0188_stores_kind_hq.sql  (#253 本部＝店舗ではない所属)
--
-- 2026-09-17 ユーザー指摘「山本君が GOLF WING のシフトボードに出ているが、実際は本部の広報担当」。
-- ユーザー決定: 「本部」を作って移す（シフト提出・打刻・給与は本部で管理、GOLF WING の表・人件費から外す）。
--
-- stores に kind を足す。'store' = 実店舗（既定）／'hq' = 本部（お客様・売上・予約・会員を持たない）。
-- 店舗の一覧（切替タブ・KPI・朝のLINE・受付・コンペ等）は kind='store' だけを出す。
-- 本部を出してよいのは シフト・勤怠・給与・スタッフ管理 だけ（DECISIONS #253）。
-- ※ 本部の行そのもの（insert）と山本さんの移動は、アプリ側の除外がデプロイされてから 0189 で入れる
--   （先に行を入れると、古いコードの店舗一覧に「本部」が出てしまうため）。

alter table public.stores add column if not exists kind text not null default 'store';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stores_kind_check') then
    alter table public.stores add constraint stores_kind_check check (kind in ('store', 'hq'));
  end if;
end $$;
-- 本部は会社に1つだけ
create unique index if not exists uq_stores_company_hq on public.stores (company_id) where kind = 'hq' and deleted_at is null;
comment on column public.stores.kind is 'store=実店舗 / hq=本部（お客様・売上を持たない。シフト・勤怠・給与だけで使う）#253';

-- 体験・入会率の店舗別KPIは実店舗だけ（本部に kpis 行を作らない）
do $$
declare d text;
begin
  d := pg_get_functiondef('public.refresh_member_kpis(uuid)'::regprocedure);
  if position('and kind = ''store''' in d) = 0 then
    d := replace(d,
      'select id, name from stores where company_id = p_company_id and status = ''active'' and deleted_at is null',
      'select id, name from stores where company_id = p_company_id and status = ''active'' and kind = ''store'' and deleted_at is null');
    if position('and kind = ''store''' in d) = 0 then
      raise exception 'refresh_member_kpis: 置換対象の行が見つかりません';
    end if;
    execute d;
  end if;
end $$;

-- データに聞く（Ask Data）の店舗一覧も実店舗だけ
create or replace view public.gnv_stores as
 select s.id as store_id,
    s.name as store_name,
    s.code as store_code,
    b.name as brand_name,
    s.segment_id,
    s.status
   from stores s
     left join brands b on b.id = s.brand_id
  where s.company_id = gn_ctx_company() and s.deleted_at is null and s.kind = 'store' and gn_store_ok(s.id);
