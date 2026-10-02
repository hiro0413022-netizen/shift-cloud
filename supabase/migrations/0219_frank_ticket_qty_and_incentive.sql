-- 0219: レッスンの長さぶんのチケット消費と、購入チケットのインセンティブ（#328・2026-10-01）
--
-- 発端（林さんの報告・2026-10-01）:
--   本田様のパーソナルを50分に変えたら「チケットは1枚しか減らないのに当日精算2,500円が出た」。
--   確定済みの予約を保存し直すと、**既に1枚使っているのに、もう1枚引けず料金だけ復活**していた。
--   （一意索引 uq_frunk_lesson_tickets_use_booking が2枚目の挿入を止め、
--     呼び出し側がそれを「チケット無し」と解釈して lesson_option_fee を2,500に戻していた）
--
-- 直し方: 利用は**1予約につき1行のまま**、枚数を qty（負数）で持つ。
--   一意索引はそのまま効かせつつ、50分なら qty=-2 にできる。
--   行を2本insertする作りにすると索引を外すことになり、二重消費の歯止めが消える。
--
-- 2026-10-01 ユーザー決定:
--   ・1枚＝25分。50分なら2枚（切り上げ）
--   ・足りないときは「あるだけ使って、残りだけ当日精算」
--   ・インセンティブは**購入チケット1枚につき担当へ1,000円**。
--     入会キャンペーンや紹介特典で無料で付与したものは**対象外**

/** 利用行のうち「購入ぶんだった枚数」＝インセンティブの対象枚数。
    古い順（先入先出）に引き当てて、使った瞬間に確定させて残す。
    あとから台帳をさかのぼって計算し直すと、付与の取り消しなどで過去の給与が動いてしまう。 */
alter table public.frunk_lesson_tickets add column if not exists paid_qty integer;

/** その回のレッスンの担当コーチ。インセンティブを「誰に」出すかの根拠。
    予約から使ったときは予約の担当（lesson_option_staff_id）、
    店頭で使ったときは画面で選んだコーチが入る。 */
alter table public.frunk_lesson_tickets add column if not exists coach_staff_id uuid references public.staff(id);

comment on column public.frunk_lesson_tickets.paid_qty is
  '利用行のみ。使った枚数のうち購入ぶん（無料付与は数えない）＝インセンティブ対象枚数';
comment on column public.frunk_lesson_tickets.coach_staff_id is
  '利用行のみ。そのレッスンの担当コーチ（インセンティブの支払先）';

create index if not exists idx_frunk_lesson_tickets_incentive
  on public.frunk_lesson_tickets (coach_staff_id, created_at)
  where kind = 'use' and status = 'granted' and deleted_at is null;

-- ⚠ 既存の利用行は paid_qty = 0（遡って出さない）。
--   ルールを決めたのは2026-10-01で、それ以前のレッスンは
--   「購入ぶんかどうか」をスタッフも意識しないまま付けている。
--   遡ると過去の給与が動くので、今日から先だけを対象にする。
update public.frunk_lesson_tickets
  set paid_qty = 0
  where kind = 'use' and paid_qty is null and deleted_at is null;

-- 給与の手当に「チケット利用のインセンティブ」を追加できるようにする
alter table public.payroll_allowances drop constraint if exists payroll_allowances_kind_check;
alter table public.payroll_allowances add constraint payroll_allowances_kind_check
  check (kind in ('personal', 'personal_ticket', 'fitting_referral', 'compe', 'round_lesson', 'commute_actual', 'other'));
