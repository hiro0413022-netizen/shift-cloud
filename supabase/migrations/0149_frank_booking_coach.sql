-- #224 (2026-09-05) 予約に「担当コーチ（ご指名）」を持たせる
--
-- ユーザー依頼:「パーソナルレッスンだけでなく、担当コーチの選択ができるようにしてほしい」
--
-- ★ なぜ lesson_option_staff_id を使い回さないか（0136）
--   あちらは「25分パーソナルを誰が教えるか」で、確定するとチケットや料金と結びつく。
--   ここは「その打席のときに見てほしい人／店側の担当」で、レッスンが無くても付く。
--   同じ列に入れると、レッスンを断ったときに担当まで消える／担当を変えるとレッスン料の扱いが動く、
--   という**別々に動くべきものが連動する**事故になる。

alter table public.frunk_bookings add column if not exists coach_staff_id uuid references public.staff(id);

comment on column public.frunk_bookings.coach_staff_id is
  '担当コーチ（ご指名・レッスンの有無に関わらず付く）。確定シフトに入っている人だけ（#224）';

-- 「今日この人が担当の予約」を引く用（一覧・本日の担当表示）
create index if not exists idx_frunk_bookings_coach
  on public.frunk_bookings (booked_date, coach_staff_id)
  where coach_staff_id is not null and deleted_at is null;
