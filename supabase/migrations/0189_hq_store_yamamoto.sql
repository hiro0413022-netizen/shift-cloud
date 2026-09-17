-- 0189_hq_store_yamamoto.sql  (#253 本部を作り、山本さんを GOLF WING 宝塚から本部へ移す)
--
-- ※ アプリ側の「本部を店舗一覧から外す」修正（#253）が本番に出てから流すこと。
--   先に流すと、古いコードの店舗タブ・朝のLINE等に「YOZAN 本部」が出る。
--
-- ユーザー決定（2026-09-17）:
--   ・本部を作って移す（シフト提出・打刻・給与は本部、GOLF WING のシフト表・紙シフト・人件費から外す）
--   ・ご本人が 9/17 に提出した10月分（下書き31件）は本部のシフトとして残す

do $$
declare
  v_company uuid := 'ec00ad2a-4032-4061-bdb7-03face8a04e7';  -- 株式会社YOZAN
  v_staff   uuid := 'd665fa2a-3119-41aa-8204-936c4b1f18bb';  -- 山本 公嗣（広報）
  v_gw      uuid := '82bb4e18-427d-4cc7-a834-c9e2a9b18199';  -- GOLF WING 宝塚
  v_gw_all  uuid := '010c992f-fdec-4f84-af81-05115832165e';  -- GOLF WING の「終日」11:00-20:00
  v_seg     uuid;
  v_brand   uuid;
  v_hq      uuid;
  v_tpl     uuid;
begin
  select id into v_seg from fin_segments where company_id = v_company and code = 'hq';

  -- stores.brand_id は必須。本部用のブランド「YOZAN」（お店のブランドとは別）
  select id into v_brand from brands where company_id = v_company and name = 'YOZAN' and deleted_at is null;
  if v_brand is null then
    insert into brands (company_id, name) values (v_company, 'YOZAN') returning id into v_brand;
  end if;

  -- 本部（会社に1つ）
  select id into v_hq from stores where company_id = v_company and kind = 'hq' and deleted_at is null;
  if v_hq is null then
    insert into stores (company_id, brand_id, name, code, kind, status, segment_id)
    values (v_company, v_brand, 'YOZAN 本部', 'hq', 'hq', 'active', v_seg)
    returning id into v_hq;
  end if;

  -- 本部のシフトテンプレート（GOLF WING の「終日」と同じ時間）
  select id into v_tpl from shift_templates
   where company_id = v_company and scope_type = 'store' and scope_id = v_hq and name = '日勤' and deleted_at is null;
  if v_tpl is null then
    insert into shift_templates (company_id, name, start_time, end_time, is_day_off, color, scope_type, scope_id, sort_order)
    values (v_company, '日勤', '11:00', '20:00', false, '#0f6b4f', 'store', v_hq, 0)
    returning id into v_tpl;
  end if;

  -- 所属: 本部を主所属に、GOLF WING 宝塚の所属は外す（履歴として deleted_at）
  if not exists (select 1 from staff_store_assignments where staff_id = v_staff and store_id = v_hq and deleted_at is null) then
    insert into staff_store_assignments (company_id, staff_id, store_id, is_primary)
    values (v_company, v_staff, v_hq, true);
  end if;
  update staff_store_assignments set deleted_at = now(), is_primary = false, updated_at = now()
   where staff_id = v_staff and store_id = v_gw and deleted_at is null;

  -- 10月分の下書き（本人提出）を本部へ。「終日」は本部の「日勤」に置き換える（時間は同じ）
  update shifts set store_id = v_hq,
         template_id = case when template_id = v_gw_all then v_tpl else template_id end,
         updated_at = now()
   where staff_id = v_staff and store_id = v_gw and deleted_at is null and date >= '2026-10-01';
  update shift_requests set template_id = v_tpl, updated_at = now()
   where staff_id = v_staff and template_id = v_gw_all and deleted_at is null and date >= '2026-10-01';

  insert into audit_logs (company_id, actor_staff_id, actor_type, action, table_name, record_id, before, after)
  values (v_company, null, 'system', 'staff.move_to_hq', 'staff', v_staff,
          jsonb_build_object('store', 'GOLF WING 宝塚'),
          jsonb_build_object('store', 'YOZAN 本部', 'hq_store_id', v_hq, 'reason', '本部の広報担当（2026-09-17 ユーザー指示・#253）'));
end $$;
