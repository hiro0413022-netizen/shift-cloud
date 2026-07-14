-- 体験後フォロー（1週間後の公式LINE等）の記録列。適用: MCP apply_migration済 2026-07-08。
alter table mbr_walkin_visits add column if not exists follow_up_at timestamptz;
alter table mbr_walkin_visits add column if not exists follow_up_note text;
alter table mbr_walkin_visits add column if not exists follow_up_by uuid references staff(id);
