-- 0108: FRANK 即時入会（承認レス）＋会員の重要説明事項マーク（#129）
-- 1) member_no の一意保証 — 即時採番（Webhook内 count+1）で衝突しないための土台
create unique index if not exists uq_frunk_members_member_no
  on frunk_members (company_id, member_no)
  where member_no is not null and deleted_at is null;

-- 2) 会員ごとの重要説明事項（スタッフ記入・入力があればカレンダーに⚠マーク）
alter table frunk_members add column if not exists alert_note text;

comment on column frunk_members.alert_note is
  '重要説明事項（スタッフ記入）。入力があると予約カレンダーの予約セルに⚠が付く（#129）';
