-- FRANK GOLF 体験予約 → 受付台帳（一時利用者名簿）への取り込み（#139 / 2026-08-18）
--
-- 背景: 体験予約は mbr_trial_requests ＋ frunk_bookings にしか入っておらず、
--       受付台帳（mbr_walkin_visits）は1行も無かった。
--       ＝「体験予約は入っているのに受付台帳が空」「体験数KPIが0のまま」。
--       これ以降はアプリ側（packages/core/src/frank-walkin.ts）が予約と同時に台帳へ書く。
--       このマイグレーションは、それ以前に入っていた予約の穴埋め（冪等・何度流しても増えない）。
--
-- 冪等キー: mbr_walkin_visits.source_reservation_no = 'FRANK-TRIAL-<mbr_trial_requests.id>'（0070のユニーク索引）
-- 名寄せ: 電話下10桁 or メール。氏名だけでは絶対にくっつけない（来店検索と同じ方針）。
-- 適用済み: 2026-08-18（本番・8件）

do $$
declare
  r record;
  gid uuid;
  made int := 0;
begin
  for r in
    select t.*
      from public.mbr_trial_requests t
     where t.deleted_at is null
       and t.status <> 'canceled'
       and t.booked_date is not null
       and not exists (
             select 1
               from public.mbr_walkin_visits v
              where v.company_id = t.company_id
                and v.source_reservation_no = 'FRANK-TRIAL-' || t.id::text
                and v.deleted_at is null)
     order by t.booked_date
  loop
    gid := null;

    select g.id into gid
      from public.mbr_guests g
     where g.company_id = r.company_id
       and g.deleted_at is null
       and (
         (nullif(app.digits(r.phone), '') is not null
           and right(app.digits(r.phone), 10) in (right(app.digits(g.phone), 10), right(app.digits(g.mobile), 10))
           and nullif(app.digits(g.phone), '') is not null)
         or (nullif(app.digits(r.phone), '') is not null
           and nullif(app.digits(g.mobile), '') is not null
           and right(app.digits(r.phone), 10) = right(app.digits(g.mobile), 10))
         or (nullif(btrim(coalesce(r.email, '')), '') is not null
           and lower(coalesce(g.email, '')) = lower(r.email))
       )
     limit 1;

    if gid is null then
      insert into public.mbr_guests (company_id, store_id, name, name_kana, phone, email)
      values (r.company_id, r.store_id, r.name,
              nullif(btrim(coalesce(r.name_kana, '')), ''),
              nullif(btrim(coalesce(r.phone, '')), ''),
              nullif(btrim(coalesce(r.email, '')), ''))
      returning id into gid;
    end if;

    insert into public.mbr_walkin_visits (
      company_id, store_id, guest_id, visited_on, visit_type, fee, payment_method, result,
      referral_source, referral_source_other, note, source_reservation_no)
    values (
      r.company_id, r.store_id, gid, r.booked_date, 'trial', 0, 'free_campaign', 'none',
      'ホームページ',
      case when r.source like 'web-self:%'
           then 'Web体験予約（' || split_part(r.source, ':', 2) || '）'
           else 'Web体験予約' end,
      concat_ws('／',
        '体験予約 ' || to_char(r.start_time, 'HH24:MI') || '〜' || to_char(r.end_time, 'HH24:MI'),
        case when r.lefty then 'レフティ' end,
        case when nullif(btrim(coalesce(r.experience, '')), '') is not null then 'ゴルフ歴: ' || r.experience end,
        case when nullif(btrim(coalesce(r.message, '')), '') is not null then 'ご要望: ' || r.message end),
      'FRANK-TRIAL-' || r.id::text);

    made := made + 1;
  end loop;

  raise notice 'FRANK体験→受付台帳 取り込み: % 件', made;
end $$;

comment on column public.mbr_walkin_visits.source_reservation_no is
  'スマートハロ予約一覧の予約番号（体験/FT取込の冪等キー）／FRANK体験のWeb予約は FRANK-TRIAL-<mbr_trial_requests.id>。手入力/タブレット由来はnull。';
