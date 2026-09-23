-- 0198: 個人LINEの連絡先を「どのスタッフか」で引けるようにする（#273・2026-09-24）
--
-- ねらい: ドリンクの注文が入った瞬間に、その時間シフトに入っているスタッフのLINEへ飛ばす。
--   シフトは staff_id で並んでいるのに、gn_line_contacts は person_name の文字列しか持っていなかった。
--   実データは "林 和希"（staff）と "林和希"（LINE連絡先）のように空白の入れ方が違うので、
--   送るたびに名前で突き合わせると、ある日静かに誰にも飛ばなくなる。idで結ぶ。
--
-- notify_orders: 注文通知だけを人ごとに止めるつまみ。全部止めたいときは1回のUPDATEで足りる
--   （update gn_line_contacts set notify_orders = false;）。デプロイは要らない。

alter table public.gn_line_contacts
  add column if not exists staff_id uuid references public.staff(id),
  add column if not exists notify_orders boolean not null default true;

comment on column public.gn_line_contacts.staff_id is
  'この連絡先の本人（staff.id）。シフトからLINEを引くために使う。null＝スタッフ以外/未紐付け';
comment on column public.gn_line_contacts.notify_orders is
  'ドリンク注文のLINE通知を受け取るか（#273）。false でこの人だけ止まる';

create index if not exists idx_gn_line_contacts_staff
  on public.gn_line_contacts (company_id, staff_id) where deleted_at is null and staff_id is not null;

-- 既存の連絡先を名前で1回だけ結ぶ。空白（半角・全角）を落として完全一致した1人だけ。
-- 部分一致にすると「小川うらら」と「小川うらら（RaRa）」のような同姓の行を取り違えるので使わない。
update public.gn_line_contacts c
set staff_id = s.id
from public.staff s
where c.staff_id is null
  and c.deleted_at is null
  and s.deleted_at is null
  and s.company_id = c.company_id
  and translate(s.name, ' 　', '') = translate(c.person_name, ' 　', '')
  and (
    select count(*) from public.staff s2
    where s2.deleted_at is null and s2.company_id = c.company_id
      and translate(s2.name, ' 　', '') = translate(c.person_name, ' 　', '')
  ) = 1;
