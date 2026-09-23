-- 0197 勤怠: 打刻の丸め（出勤=切り上げ／退勤=切り下げ）を「計算用の時刻」として持つ（2026-09-23）
--
-- ユーザー依頼:
--   出勤は15分単位で切り上げ、退勤は15分単位で切り下げ、ちょうどの時刻はそのまま。
--   画面には「元の打刻」と「計算用（丸め後）」の両方を出す。元の打刻は書き換えない。
--
-- 設計:
--   clock_in / clock_out は今までどおり **打刻そのもの**（変更しない）。
--   丸めた時刻は rounded_clock_in / rounded_clock_out に持ち、work_minutes はこの時刻で計算する。
--   raw_work_minutes は「丸める前だと何分だったか」＝画面の説明・検証用。
--   丸め幅は会社設定 companies.settings.rounding_minutes（GOLF WING=15）。0なら丸めなし。

alter table public.attendance_days
  add column if not exists rounded_clock_in  timestamptz,
  add column if not exists rounded_clock_out timestamptz,
  add column if not exists raw_work_minutes  integer;

comment on column public.attendance_days.clock_in is '出勤の打刻そのもの（丸めない）';
comment on column public.attendance_days.clock_out is '退勤の打刻そのもの（丸めない）';
comment on column public.attendance_days.rounded_clock_in is '計算用の出勤（丸め単位に切り上げ）';
comment on column public.attendance_days.rounded_clock_out is '計算用の退勤（丸め単位に切り下げ）';
comment on column public.attendance_days.raw_work_minutes is '丸める前の実働（分）。work_minutes は丸め後';

-- 既存行の「計算用の時刻」と「丸める前の実働」を埋める。
-- ★ work_minutes（給与に使う数字）は過去の月を動かさない。確定済みの給与と合わなくなるため、
--   実働の入れ替えは当月（2026-09）以降だけにする。過去月を入れ直すときは手動で recalc する。
with cfg as (
  select id as company_id,
         coalesce((settings->>'rounding_minutes')::int, 0) as unit
    from public.companies
)
update public.attendance_days a
   set rounded_clock_in = case
         when a.clock_in is null or c.unit <= 0 then a.clock_in
         else to_timestamp(ceil(extract(epoch from a.clock_in) / (c.unit * 60)) * (c.unit * 60))
       end,
       rounded_clock_out = case
         when a.clock_out is null or c.unit <= 0 then a.clock_out
         else to_timestamp(floor(extract(epoch from a.clock_out) / (c.unit * 60)) * (c.unit * 60))
       end,
       raw_work_minutes = a.work_minutes
  from cfg c
 where c.company_id = a.company_id
   and a.rounded_clock_in is null
   and a.rounded_clock_out is null;
