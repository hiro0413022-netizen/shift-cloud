-- 0178 money-os：お客様をお名前で選べるようにする
--
-- 背景（2026-09-13 ユーザー要望）
--   money-os の売上入力は、お客様名を毎回キーボードで打っていた。
--   craft-os と同じく「探して選ぶ」を入口にしたい。
--
-- ここで分かったこと
--   受付台帳 mbr_guests は「人」ではなく「受付1回」の記録だった。
--   6,251行あるが、お名前は 2,009 通りしかない（西原様は36行ある）。
--   そのまま検索に出すと同じ方が何十行も並ぶので、お名前で束ねた「人の一覧」を作る。
--
-- 会員／ビジターは mbr_members（在籍249名）の氏名一致で判定する。
-- 姓名の間の空白は表記ゆれがあるので、空白を取り除いた形で突き合わせる。

create or replace view public.mbr_people
with (security_invoker = on) as
with g as (
  select
    company_id,
    store_id,
    regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g') as name_key,
    name,
    name_kana,
    phone,
    mobile,
    coalesce(updated_at, created_at) as seen_at
  from public.mbr_guests
  where deleted_at is null
    and coalesce(name, '') <> ''
),
m as (
  select distinct
    company_id,
    regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g') as name_key
  from public.mbr_members
  where leave_date is null
    and coalesce(name, '') <> ''
)
select
  g.company_id,
  g.store_id,
  g.name_key,
  -- 表示名は「いちばん新しい受付のときの書き方」に合わせる
  (array_agg(g.name order by g.seen_at desc nulls last))[1] as name,
  (array_agg(g.name_kana order by g.seen_at desc nulls last)
     filter (where coalesce(g.name_kana, '') <> ''))[1] as name_kana,
  (array_agg(coalesce(g.mobile, g.phone) order by g.seen_at desc nulls last)
     filter (where coalesce(g.mobile, g.phone) <> ''))[1] as phone,
  count(*)::int as visits,
  max(g.seen_at) as last_seen_at,
  exists (select 1 from m where m.company_id = g.company_id and m.name_key = g.name_key) as is_member
from g
group by g.company_id, g.store_id, g.name_key;

comment on view public.mbr_people is
  '受付台帳（mbr_guests）をお名前で束ねた「人」の一覧。money-os / craft-os のお客様検索の入口。visits は受付回数、is_member は mbr_members に在籍中の同名がいるか。';

-- 束ねるときに毎回フルスキャンしないように
create index if not exists idx_mbr_guests_company_store_name
  on public.mbr_guests (company_id, store_id, name)
  where deleted_at is null;

grant select on public.mbr_people to authenticated, service_role;
