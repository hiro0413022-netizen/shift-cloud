-- 0083: FRANK GOLF 体験のセルフ予約（日時を選ぶだけで即確定・打席は自動割当）
--
-- 背景: 体験は「スタッフからの折り返し」で確定していたため、申込→来店の間に離脱が起きる。
--       非会員がその場で日時を選んで確定できるようにする。打席はお客様に選ばせず自動割当。
--
-- 打席の実態（2026-07-27 ユーザー確認）:
--   A打席(1F)  … 体験の第1優先
--   B打席(2F)  … 左右打席。レフティの方はここのみ。第2優先
--   C打席(2F)  … 第3優先
--   D打席(2F)  … 未設営のため当面クローズ（active=false）
--   ※ 0081のシード5打席（bay-1f-l 等）は実店舗と合わないため論理削除する。
--      frunk_bookings は0件のため、参照が壊れることはない。
--
-- RLS: いずれも enable のみ＝service_role専用（0081/0082と同型）。新規関数なし＝EXECUTE付与不要。
-- ※ 0084 で res_* を廃止し、予約台帳は frunk_bookings に一本化した（#93）。

-- ============================================================
-- 1) 打席マスタ: レフティ可否と体験の割当優先順を持たせる
-- ============================================================
alter table frunk_bays add column if not exists is_lefty boolean not null default false;
comment on column frunk_bays.is_lefty is '左右打席（レフティ対応）。レフティ希望の体験はこの打席にのみ割り当てる';

alter table frunk_bays add column if not exists trial_priority int;
comment on column frunk_bays.trial_priority is '体験の自動割当順（小さいほど優先）。null＝体験には割り当てない';

-- 旧シード（実店舗と不一致）を論理削除
update frunk_bays
   set deleted_at = now(), active = false
 where code in ('bay-1f-l', 'bay-1f-r', 'bay-2f-1', 'bay-2f-2', 'bay-2f-3')
   and deleted_at is null;

-- 実店舗の A/B/C/D を投入（company_id は既存行から引き継ぐ＝ハードコードしない）
insert into frunk_bays (company_id, code, name, floor, equipment, sort, active, is_lefty, trial_priority)
select b.company_id, v.code, v.name, v.floor, v.equipment, v.sort, v.active, v.is_lefty, v.trial_priority
  from (select company_id from frunk_bays order by created_at limit 1) b
 cross join (values
   ('bay-a', 'A打席',            1, 'TrackMan 4', 1, true,  false, 1),
   ('bay-b', 'B打席（左右打席）', 2, null,         2, true,  true,  2),
   ('bay-c', 'C打席',            2, null,         3, true,  false, 3),
   ('bay-d', 'D打席',            2, null,         4, false, false, null)
 ) as v(code, name, floor, equipment, sort, active, is_lefty, trial_priority)
on conflict (code) do update
   set name           = excluded.name,
       floor          = excluded.floor,
       sort           = excluded.sort,
       active         = excluded.active,
       is_lefty       = excluded.is_lefty,
       trial_priority = excluded.trial_priority,
       deleted_at     = null;

-- ============================================================
-- 2) 体験申込に「確定した枠」を持たせる
--    status は既存の check で 'confirmed' が使える（pending/confirmed/done/canceled）
-- ============================================================
alter table mbr_trial_requests add column if not exists booked_date date;
alter table mbr_trial_requests add column if not exists start_time  time;
alter table mbr_trial_requests add column if not exists end_time    time;
alter table mbr_trial_requests add column if not exists bay_id      uuid references frunk_bays(id);
alter table mbr_trial_requests add column if not exists lefty       boolean not null default false;
alter table mbr_trial_requests add column if not exists cancel_token text;

comment on column mbr_trial_requests.booked_date  is 'セルフ予約で確定した日付（null＝旧方式の折り返し待ち）';
comment on column mbr_trial_requests.lefty        is 'レフティ（左打ち）希望。true なら左右打席のみに割り当てる';
comment on column mbr_trial_requests.cancel_token is 'お客様がURLだけでキャンセルできるようにする使い捨てトークン';

create index if not exists idx_mbr_trial_requests_date
  on mbr_trial_requests (booked_date, start_time)
  where deleted_at is null and booked_date is not null;

create unique index if not exists uq_mbr_trial_cancel_token
  on mbr_trial_requests (cancel_token)
  where cancel_token is not null;

-- ============================================================
-- 3) 打席予約テーブルを非会員（体験）でも使えるようにする
--    ★ 会員予約と同じテーブルに入れることで、既存の unique index
--      uq_frunk_booking_slot がそのまま二重予約を防ぐ
-- ============================================================
alter table frunk_bookings alter column member_id drop not null;

alter table frunk_bookings add column if not exists trial_request_id uuid references mbr_trial_requests(id);
comment on column frunk_bookings.trial_request_id is '体験のセルフ予約。会員予約は member_id、体験は trial_request_id が入る';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'frunk_bookings_owner_chk'
  ) then
    alter table frunk_bookings
      add constraint frunk_bookings_owner_chk
      check (member_id is not null or trial_request_id is not null);
  end if;
end $$;

create index if not exists idx_frunk_bookings_trial
  on frunk_bookings (trial_request_id)
  where trial_request_id is not null and deleted_at is null;
