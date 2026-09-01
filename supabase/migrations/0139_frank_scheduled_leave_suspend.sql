-- #192 (2026-09-01) FRANK GOLF 退会・休会の「予約」受付
--
-- これまで退会・休会は押した瞬間に効いた。実際の店のルールは
--   退会 = 申込月の翌月末（9月末退会なら8月末までの申し出）
--   休会 = 当月10日までの申し出で翌月から、11日以降は翌々月から
-- なので「先の日付で受け付けて、その日が来たら切り替わる」必要がある。
--
-- status は当日まで active のまま（予約は取れる・会員証も使える）。
-- 予定日が来たら genesis の日次cron (/api/cron/daily) が status を切り替える。
-- Square 側は受付時点で canceled_date / pause_effective_date を入れて予約済みにするので、
-- 仮にcronが遅れてもお金は正しい日付で止まる。

alter table frunk_members
  add column if not exists scheduled_leave_date   date,
  add column if not exists scheduled_suspend_start date;

comment on column frunk_members.scheduled_leave_date is
  '退会予定日（必ず月末）。この日までは在籍。翌日にcronで status=left へ。';
comment on column frunk_members.scheduled_suspend_start is
  '休会開始予定日（必ず月初）。この日にcronで status=suspended へ。';

create index if not exists idx_frunk_members_scheduled_leave
  on frunk_members (scheduled_leave_date) where scheduled_leave_date is not null;
create index if not exists idx_frunk_members_scheduled_suspend
  on frunk_members (scheduled_suspend_start) where scheduled_suspend_start is not null;
