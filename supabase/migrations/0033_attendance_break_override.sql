-- 0033: 勤怠の休憩「手動上書き」列を追加
-- break_minutes は自動計算値（打刻ペア or 段階式自動休憩）を保持し、
-- break_override_minutes に値がある場合はそれを優先して実働を再計算する。
-- null = 自動計算に従う（後から自動へ戻せる）。

alter table public.attendance_days
  add column if not exists break_override_minutes integer;

comment on column public.attendance_days.break_override_minutes is
  '休憩の手動上書き（分）。null=自動計算（打刻優先→なければ段階式：労働6h超45分/8h超60分）。値ありで実働=拘束-この値。';
