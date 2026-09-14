-- 0180 mbr_search_people に guest_id を足す（craft-os の表紙・カルテ紐づけ用）
--
-- craft-os の GuestPicker も受付台帳を素のまま出していて、同じ方が何十行も並んでいた。
-- money-os と同じ mbr_search_people に寄せる。gw_fittings.guest_id には
-- 「いちばん新しい受付」の行IDを入れる（受付台帳は受付1回ごとの行なので、人を1つのIDで指せない）。
--
-- 戻り値の列が増えるので create or replace では通らない。落として作り直す。
drop function if exists public.mbr_search_people(uuid, uuid, text, int);

create function public.mbr_search_people(
  p_company_id uuid,
  p_store_id uuid,
  p_q text,
  p_limit int default 20
)
returns table (
  name_key text,
  guest_id uuid,
  name text,
  name_kana text,
  phone text,
  visits int,
  last_seen_at timestamptz,
  is_member boolean
)
language sql
stable
-- 呼ぶのはサービスロール（アプリのadminクライアント）なので definer にしない。RLS はそのまま効かせる。
set search_path = public
as $$
  with q as (
    select
      btrim(coalesce(p_q, '')) as raw,
      regexp_replace(coalesce(p_q, ''), '[[:space:]　]', '', 'g') as bare,
      coalesce(app.kana(p_q), '') as kana,
      regexp_replace(coalesce(p_q, ''), '\D', '', 'g') as digits
  ),
  hit as (
    select
      regexp_replace(coalesce(g.name, ''), '[[:space:]　]', '', 'g') as name_key,
      g.id,
      g.name,
      g.name_kana,
      coalesce(nullif(g.mobile, ''), nullif(g.phone, '')) as phone,
      coalesce(g.updated_at, g.created_at) as seen_at
    from public.mbr_guests g, q
    where g.company_id = p_company_id
      and (p_store_id is null or g.store_id = p_store_id)
      and g.deleted_at is null
      and coalesce(g.name, '') <> ''
      and (
        q.raw = ''
        -- お名前（打った通り／空白を抜いた形）
        or g.name ilike '%' || q.raw || '%'
        or (q.bare <> '' and regexp_replace(coalesce(g.name, ''), '[[:space:]　]', '', 'g') ilike '%' || q.bare || '%')
        -- フリガナ（ひらがなで打ってもカタカナに寄せて拾う）
        or (q.kana <> '' and coalesce(app.kana(g.name_kana), '') like '%' || q.kana || '%')
        -- お電話（下4桁だけでも拾う）
        or (q.digits <> '' and regexp_replace(coalesce(g.mobile, ''), '\D', '', 'g') like '%' || q.digits || '%')
        or (q.digits <> '' and regexp_replace(coalesce(g.phone, ''), '\D', '', 'g') like '%' || q.digits || '%')
      )
  ),
  grouped as (
    select
      h.name_key,
      -- 受付台帳の行IDは「いちばん新しい受付」のもの（craft-os のカルテ紐づけ用）
      (array_agg(h.id order by h.seen_at desc nulls last))[1] as guest_id,
      -- 表示名は「いちばん新しい受付のときの書き方」に合わせる
      (array_agg(h.name order by h.seen_at desc nulls last))[1] as name,
      (array_agg(h.name_kana order by h.seen_at desc nulls last)
         filter (where coalesce(h.name_kana, '') <> ''))[1] as name_kana,
      (array_agg(h.phone order by h.seen_at desc nulls last)
         filter (where h.phone is not null))[1] as phone,
      count(*)::int as visits,
      max(h.seen_at) as last_seen_at
    from hit h
    group by h.name_key
  )
  select
    gr.name_key,
    gr.guest_id,
    gr.name,
    gr.name_kana,
    gr.phone,
    gr.visits,
    gr.last_seen_at,
    exists (
      select 1 from public.mbr_members m
      where m.company_id = p_company_id
        and m.leave_date is null
        and regexp_replace(coalesce(m.name, ''), '[[:space:]　]', '', 'g') = gr.name_key
    ) as is_member
  from grouped gr
  -- よく来られる方・最近来られた方が上に出る
  order by gr.visits desc, gr.last_seen_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

comment on function public.mbr_search_people(uuid, uuid, text, int) is
  'お客様をお名前・フリガナ・電話番号で探す。受付台帳は受付1回ごとの記録なので、お名前で束ねて「人」にして返す。money-os の売上入力の入口。';

revoke all on function public.mbr_search_people(uuid, uuid, text, int) from public;
grant execute on function public.mbr_search_people(uuid, uuid, text, int) to authenticated, service_role;
