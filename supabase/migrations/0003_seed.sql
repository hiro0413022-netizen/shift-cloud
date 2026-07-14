-- 0003_seed: 株式会社YOZAN / GOLF WING 初期データ
-- 適用済み: 2026-07-02 → yozan-shift-cloud (qrgpblnnhdudigarrtuz)
do $$
declare cid uuid;
begin
  insert into companies (name, settings)
  values ('株式会社YOZAN', '{"rounding_minutes": 0, "overtime_rate": 1.25}'::jsonb)
  returning id into cid;

  declare bid uuid;
  begin
    insert into brands (company_id, name) values (cid, 'GOLF WING') returning id into bid;
    insert into stores (company_id, brand_id, name, code, open_time, close_time) values
      (cid, bid, 'GOLF WING 宝塚', 'takarazuka', '10:00', '21:00'),
      (cid, bid, 'GOLF WING 夙川', 'shukugawa', '10:00', '21:00'),
      (cid, bid, 'GOLF WING 明石', 'akashi', '10:00', '21:00'),
      (cid, bid, 'GOLF WING 新宿', 'shinjuku', '10:00', '21:00');
  end;

  insert into roles (company_id, name, is_system, permissions) values
    (cid, '会社オーナー', true, '{"manage_company":true,"manage_org":true,"manage_staff":true,"manage_templates":true,"create_shifts":true,"edit_attendance":true,"view_payroll":true,"manage_payroll":true,"view_hq":true,"manage_announcements":true,"approve_suggestions":true,"manage_kiosks":true,"view_audit":true}'),
    (cid, '本部', true, '{"manage_org":true,"manage_staff":true,"manage_templates":true,"create_shifts":true,"edit_attendance":true,"view_payroll":true,"manage_payroll":true,"view_hq":true,"manage_announcements":true,"approve_suggestions":true,"manage_kiosks":true,"view_audit":true}'),
    (cid, 'エリアマネージャー', true, '{"manage_staff":true,"manage_templates":true,"create_shifts":true,"edit_attendance":true,"manage_announcements":true,"manage_kiosks":true}'),
    (cid, '店舗責任者', true, '{"manage_staff":true,"manage_templates":true,"create_shifts":true,"edit_attendance":true,"manage_announcements":true,"manage_kiosks":true}'),
    (cid, 'スタッフ', true, '{}'),
    (cid, '閲覧専用', true, '{"read_only":true}');

  insert into shift_templates (company_id, name, start_time, end_time, is_day_off, color, sort_order) values
    (cid, '終日', '11:00', '20:00', false, '#0F6B4F', 1),
    (cid, '早番', '10:00', '17:00', false, '#2563eb', 2),
    (cid, '遅番', '13:00', '20:00', false, '#7c3aed', 3),
    (cid, '午前', '10:00', '13:00', false, '#0891b2', 4),
    (cid, '午後', '13:00', '17:00', false, '#ca8a04', 5),
    (cid, '夕方', '17:00', '20:00', false, '#ea580c', 6),
    (cid, 'レッスン', '11:00', '20:00', false, '#16a34a', 7),
    (cid, '工房', '11:00', '20:00', false, '#78716c', 8),
    (cid, '受付', '11:00', '20:00', false, '#db2777', 9),
    (cid, 'ラウンド', null, null, false, '#65a30d', 10),
    (cid, '休み', null, null, true, '#a1a1aa', 99);

  insert into schedule_types (company_id, name, category, color, sort_order) values
    (cid, '現場', 'work', '#0F6B4F', 1),
    (cid, 'レッスン', 'work', '#16a34a', 2),
    (cid, 'ラウンドレッスン', 'work', '#65a30d', 3),
    (cid, '会議', 'work', '#2563eb', 4),
    (cid, '営業', 'work', '#0891b2', 5),
    (cid, '撮影', 'work', '#7c3aed', 6),
    (cid, '出張', 'work', '#ca8a04', 7),
    (cid, 'VIP対応', 'work', '#db2777', 8),
    (cid, 'イベント', 'work', '#ea580c', 9),
    (cid, 'コンペ', 'work', '#dc2626', 10),
    (cid, '研修', 'work', '#78716c', 11),
    (cid, '休日', 'leave', '#a1a1aa', 12),
    (cid, '有給', 'leave', '#f59e0b', 13);
end $$;
