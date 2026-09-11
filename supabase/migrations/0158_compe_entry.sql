-- #233 (2026-09-10) コンペの参加申し込みを会員様ご自身で出せるようにする（募集URL）
--
-- ★ 申し込みは「参加者」と別テーブルにしない。
--   別にすると、受付当日に「申込者の表」と「参加者の表」を2つ見ることになり、
--   どちらが本当の人数か分からなくなる（旧システムで人数が食い違った原因と同じ形）。
--   cmp_participants に状態を持たせ、確定した人もキャンセルした人も1つの名簿に並べる。
--
-- ★ 定員を超えた申し込みは断らずキャンセル待ちにする。
--   締め切ってしまうと、キャンセルが出たときに誰へ声をかければよいか分からなくなる。

alter table public.cmp_comps
  add column if not exists entry_slug text,
  add column if not exists entry_open boolean not null default false,
  add column if not exists entry_capacity integer,
  add column if not exists entry_opens_on date,
  add column if not exists entry_closes_on date,
  add column if not exists entry_note text,
  add column if not exists play_fee integer;

comment on column public.cmp_comps.entry_slug is '募集ページのURL末尾（/e/<slug>）。null＝募集ページを持たない（#233）';
comment on column public.cmp_comps.entry_open is '募集受付中か。false なら /e/<slug> は「受付前・締切」を表示する';
comment on column public.cmp_comps.entry_capacity is '募集人数。超えた分はキャンセル待ちとして受け付ける';
comment on column public.cmp_comps.play_fee is 'プレー代（円・参加費とは別）。案内と募集ページに出す';

create unique index if not exists uq_cmp_comps_entry_slug
  on public.cmp_comps (entry_slug) where entry_slug is not null;

alter table public.cmp_participants
  add column if not exists entry_status text not null default 'confirmed',
  add column if not exists applied_at timestamptz,
  add column if not exists source text not null default 'staff';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmp_participants_entry_status'
  ) then
    alter table public.cmp_participants
      add constraint cmp_participants_entry_status
      check (entry_status in ('confirmed', 'applied', 'waitlist', 'cancelled'));
  end if;
end $$;

comment on column public.cmp_participants.entry_status is 'confirmed=参加確定 / applied=Web申込（定員内）/ waitlist=キャンセル待ち / cancelled=取消。スタッフ登録は既定 confirmed（#233）';
comment on column public.cmp_participants.source is 'staff=スタッフ登録 / web=募集ページからのご本人申込';

create index if not exists idx_cmp_participants_entry
  on public.cmp_participants (comp_id, entry_status) where deleted_at is null;
