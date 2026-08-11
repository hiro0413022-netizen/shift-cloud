-- 0110_visitor_search.sql
-- 来店検索（member-os /search）— 「この人、前にウチに来たことある？」を1画面で答える。
--
-- 受付台帳(/)は「期間で絞って一覧」しかできず、氏名や電話で過去をたどれなかった。
-- ここでは 一時利用者(mbr_guests + mbr_walkin_visits) / GOLF WING会員(mbr_members) /
-- FRANK会員(frunk_members + frunk_bookings) / FRANKのビジター予約(frunk_bookings.guest_*)
-- を横断して、氏名・カナ・電話・メール・会員番号のどれでも引けるようにする。
--
-- 電話はハイフン有無・全角混在があるので必ず数字だけに正規化して比較する（app.digits）。
-- 店舗またぎ防止(#128): p_store_ids に配属店舗を渡す。null＝オーナー（全店舗横断）。
--   ・mbr_members は店舗列を持たない GOLF WING の名簿なので p_include_gw で出し分ける。
-- 人物の名寄せ（同じ人の guest / 会員 / FRANK を1枚のカードにまとめる）はアプリ側で行う。
--   ここは「マッチした人物候補＋その来店履歴」を平らに返すところまで。

-- ============================================================
-- 1. 電話番号などを数字だけにする共通関数
-- ============================================================
create or replace function app.digits(t text) returns text
language sql immutable
as $$
  select nullif(regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g'), '')
$$;

-- ============================================================
-- 2. search_visitors — 横断検索の本体
-- ============================================================
create or replace function search_visitors(
  p_company_id uuid,
  p_q text,
  p_store_ids uuid[] default null,
  p_include_gw boolean default true,
  p_limit int default 60
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw    text := btrim(coalesce(p_q, ''));
  v_like   text;
  v_digits text := app.digits(p_q);
  v_cap    int  := greatest(coalesce(p_limit, 60), 1) * 4;  -- 各ソースの取り過ぎ防止
  v_out    jsonb;
begin
  if length(v_raw) = 0 then
    return '[]'::jsonb;
  end if;
  v_like := '%' || v_raw || '%';

  with
  -- ---------- 一時利用者（受付台帳の顧客） ----------
  guest_hit as (
    select g.id, g.name, g.name_kana, g.gender, g.birth_date,
           coalesce(nullif(g.mobile, ''), nullif(g.phone, '')) as phone,
           g.email, g.postal_code, g.prefecture, g.address1, g.building,
           g.occupation, g.contact_method, g.note
    from mbr_guests g
    where g.company_id = p_company_id
      and g.deleted_at is null
      and (
        g.name ilike v_like
        or g.name_kana ilike v_like
        or g.email ilike v_like
        or (v_digits is not null and (
              app.digits(g.phone)  like '%' || v_digits || '%'
           or app.digits(g.mobile) like '%' || v_digits || '%'))
      )
      and (
        p_store_ids is null
        or g.store_id = any(p_store_ids)
        or exists (
          select 1 from mbr_walkin_visits v
          where v.guest_id = g.id and v.deleted_at is null and v.store_id = any(p_store_ids)
        )
      )
    order by g.updated_at desc nulls last
    limit v_cap
  ),
  guest_visit as (
    select v.guest_id,
           count(*)::int          as visit_count,
           min(v.visited_on)      as first_visit,
           max(v.visited_on)      as last_visit,
           jsonb_agg(jsonb_build_object(
             'date',    v.visited_on,
             'type',    v.visit_type,
             'store',   s.name,
             'fee',     v.fee,
             'result',  v.result,
             'pro',     v.pro_staff,
             'staff',   st.name,
             'payment', v.payment_method,
             'discount', v.discount,
             'note',    v.note
           ) order by v.visited_on desc) as visits
    from mbr_walkin_visits v
    left join stores s  on s.id  = v.store_id
    left join staff  st on st.id = v.reception_staff_id
    where v.deleted_at is null
      and v.guest_id in (select id from guest_hit)
      and (p_store_ids is null or v.store_id = any(p_store_ids))
    group by v.guest_id
  ),
  guest_person as (
    select coalesce(gv.last_visit, date '1900-01-01') as sort_date,
           jsonb_build_object(
             'kind', 'guest', 'id', gh.id,
             'name', gh.name, 'name_kana', gh.name_kana,
             'phone', gh.phone, 'email', gh.email,
             'birth_date', gh.birth_date, 'gender', gh.gender,
             'address', nullif(btrim(concat_ws(' ', gh.prefecture, gh.address1, gh.building)), ''),
             'occupation', gh.occupation, 'contact_method', gh.contact_method,
             'note', gh.note,
             'visit_count', coalesce(gv.visit_count, 0),
             'first_visit', gv.first_visit,
             'last_visit',  gv.last_visit,
             'visits', coalesce(gv.visits, '[]'::jsonb)
           ) as person
    from guest_hit gh
    left join guest_visit gv on gv.guest_id = gh.id
  ),

  -- ---------- GOLF WING 会員名簿（Smart Hello取込・店舗列なし） ----------
  member_person as (
    select coalesce(m.last_visit_date, m.join_date, date '1900-01-01') as sort_date,
           jsonb_build_object(
             'kind', 'member', 'id', m.id,
             'name', m.name, 'name_kana', m.name_kana,
             'phone', null, 'email', null,
             'birth_date', m.birth_date, 'gender', m.gender,
             'member_no', m.member_no, 'member_type', m.member_type,
             'class_name', m.class_name, 'store', m.store_name,
             'join_date', m.join_date, 'leave_date', m.leave_date,
             'leave_reason', m.leave_reason,
             'monthly_visits', m.monthly_visits,
             'last_visit', m.last_visit_date,
             'visit_count', 0, 'visits', '[]'::jsonb
           ) as person
    from mbr_members m
    where p_include_gw
      and m.company_id = p_company_id
      and (m.name ilike v_like or m.name_kana ilike v_like or m.member_no ilike v_like)
    order by m.join_date desc nulls last
    limit v_cap
  ),

  -- ---------- FRANK GOLF 会員 ----------
  frunk_hit as (
    select f.id, f.member_no, f.name, f.name_kana, f.phone, f.email,
           f.birth_date, f.gender, f.status, f.join_date, f.leave_date,
           f.alert_note, f.note, p.name as plan_name
    from frunk_members f
    left join frunk_plans p on p.id = f.plan_id
    where f.company_id = p_company_id
      and f.deleted_at is null
      and (p_store_ids is null or f.store_id = any(p_store_ids))
      and (
        f.name ilike v_like or f.name_kana ilike v_like
        or f.email ilike v_like or f.member_no ilike v_like
        or (v_digits is not null and app.digits(f.phone) like '%' || v_digits || '%')
      )
    order by f.join_date desc nulls last
    limit v_cap
  ),
  frunk_visit as (
    select b.member_id,
           count(*)::int      as visit_count,
           min(b.booked_date) as first_visit,
           max(b.booked_date) as last_visit,
           jsonb_agg(jsonb_build_object(
             'date',  b.booked_date,
             'type',  'frank_bay',
             'store', s.name,
             'start', b.start_time,
             'end',   b.end_time,
             'fee',   b.amount,
             'status', b.status,
             'note',  b.note
           ) order by b.booked_date desc) as visits
    from frunk_bookings b
    left join stores s on s.id = b.store_id
    where b.deleted_at is null
      and b.status <> 'cancelled'
      and b.member_id in (select id from frunk_hit)
      and (p_store_ids is null or b.store_id = any(p_store_ids))
    group by b.member_id
  ),
  frunk_person as (
    select coalesce(fv.last_visit, fh.join_date, date '1900-01-01') as sort_date,
           jsonb_build_object(
             'kind', 'frank', 'id', fh.id,
             'name', fh.name, 'name_kana', fh.name_kana,
             'phone', fh.phone, 'email', fh.email,
             'birth_date', fh.birth_date, 'gender', fh.gender,
             'member_no', fh.member_no, 'status', fh.status,
             'plan', fh.plan_name,
             'join_date', fh.join_date, 'leave_date', fh.leave_date,
             'alert_note', fh.alert_note, 'note', fh.note,
             'visit_count', coalesce(fv.visit_count, 0),
             'first_visit', fv.first_visit,
             'last_visit',  fv.last_visit,
             'visits', coalesce(fv.visits, '[]'::jsonb)
           ) as person
    from frunk_hit fh
    left join frunk_visit fv on fv.member_id = fh.id
  ),

  -- ---------- FRANK ビジター予約（会員でない来店者） ----------
  fguest_person as (
    select max(b.booked_date) as sort_date,
           jsonb_build_object(
             'kind', 'frank_guest',
             'id', max(coalesce(app.digits(b.guest_phone), b.guest_name)),
             'name', max(b.guest_name),
             'name_kana', null,
             'phone', max(b.guest_phone),
             'visit_count', count(*)::int,
             'first_visit', min(b.booked_date),
             'last_visit',  max(b.booked_date),
             'visits', jsonb_agg(jsonb_build_object(
               'date',  b.booked_date,
               'type',  'frank_visitor',
               'store', s.name,
               'start', b.start_time,
               'fee',   b.amount,
               'status', b.status,
               'note',  b.note
             ) order by b.booked_date desc)
           ) as person
    from frunk_bookings b
    left join stores s on s.id = b.store_id
    where b.company_id = p_company_id
      and b.deleted_at is null
      and b.member_id is null
      and b.status <> 'cancelled'
      and (p_store_ids is null or b.store_id = any(p_store_ids))
      and (
        b.guest_name ilike v_like
        or (v_digits is not null and app.digits(b.guest_phone) like '%' || v_digits || '%')
      )
    group by coalesce(app.digits(b.guest_phone), b.guest_name)
    limit v_cap
  ),

  merged as (
    select sort_date, person from guest_person
    union all select sort_date, person from member_person
    union all select sort_date, person from frunk_person
    union all select sort_date, person from fguest_person
  )
  select coalesce(jsonb_agg(person order by sort_date desc), '[]'::jsonb)
  into v_out
  from (select sort_date, person from merged order by sort_date desc limit p_limit) t;

  return v_out;
end $$;

-- service_role へのEXECUTE付与を忘れるとサーバー側から呼べない（DB権限監査 2026-07-17）
grant execute on function app.digits(text) to authenticated, service_role;
grant execute on function search_visitors(uuid, text, uuid[], boolean, int) to authenticated, service_role;

-- ============================================================
-- 3. 検索を支えるインデックス（部分一致なのでtrigram）
-- ============================================================
-- Supabase の拡張は extensions スキーマに置く慣例（pgcryptoと揃える）
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_mbr_guests_name_trgm      on mbr_guests using gin (name extensions.gin_trgm_ops);
create index if not exists idx_mbr_guests_kana_trgm      on mbr_guests using gin (name_kana extensions.gin_trgm_ops);
create index if not exists idx_mbr_guests_phone_digits   on mbr_guests (app.digits(phone));
create index if not exists idx_mbr_guests_mobile_digits  on mbr_guests (app.digits(mobile));
create index if not exists idx_mbr_walkin_visits_guest   on mbr_walkin_visits (guest_id) where deleted_at is null;
create index if not exists idx_mbr_members_name_trgm     on mbr_members using gin (name extensions.gin_trgm_ops);
create index if not exists idx_frunk_bookings_member     on frunk_bookings (member_id) where deleted_at is null;
