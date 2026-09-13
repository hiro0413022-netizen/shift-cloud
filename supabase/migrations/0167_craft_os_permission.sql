-- 適用済み: 2026-09-12（Supabase migration名 craft_os_permission）
-- craft-os（フィッティング・工房管理）の権限 use_craft を、現場のロールに付ける。
-- 見積の金額を触るため、閲覧専用・営業には付けない。
update roles
set permissions = permissions || '{"use_craft": true}'::jsonb
where company_id = 'ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and name in ('会社オーナー','本部','エリアマネージャー','店舗責任者','コーチング（店舗）','受付（体験受付）');
