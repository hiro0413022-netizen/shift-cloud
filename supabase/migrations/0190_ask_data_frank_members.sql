-- ============================================================
-- 0190: 「データに聞く」で FRANK GOLF の会員数を答えられるようにする（DECISIONS #254）
--
-- 背景（2026-09-17 ユーザー）:
--   「genesisにフランク会員の法人プランとスタッフ、モニターを除いた会員数は
--     と聞いたら 該当するデータがありませんでした と出ます」
--
-- 原因:
--   1) FRANK の会員（frunk_members）を見せるビューが無かった。
--      Ask Data が知っている会員ビューは gnv_members だけで、これは
--      GOLF WING の会員台帳（mbr_members）。AI はそこを FRANK で絞って 0 件になっていた。
--      （実際の答えは 22名 = ライト7 + レギュラー15）
--   2) 0135 で作った gnv_bookings / gnv_walkins / gnv_orders に
--      gn_chat_reader の SELECT 権限が付いていなかった
--      （gn_chat_query は gn_chat_reader 権限で動く）。
--      「フランクの予約一覧」は permission denied で失敗していた。
--      逆に authenticated には付いていた（0064 の方針＝ gnv_* はアプリのログインユーザーに見せない、に反する）。
--
-- 0053 / 0135 と同じく security_invoker は付けない。
-- 会社・店舗の絞り込みは where 句の gn_ctx_company() / gn_store_ok() が担う。
-- ============================================================

create or replace view gnv_frank_members as
select
  m.member_no,
  m.name                                   as member_name,
  p.name                                   as plan_name,
  case
    when coalesce(p.is_corporate, false) then '法人'
    when p.name like '%スタッフ%'         then 'スタッフ'
    when p.name like '%モニター%'         then 'モニター'
    when p.name like '%テスト%'           then 'テスト'
    else '一般'
  end                                      as plan_type,
  coalesce(p.is_corporate, false)          as is_corporate,
  case
    when m.corporate_parent_id is not null   then '法人利用者'
    when coalesce(p.is_corporate, false)     then '法人契約'
    else '個人'
  end                                      as member_role,
  p.monthly_price,
  m.status,
  case m.status
    when 'active'    then '在籍'
    when 'suspended' then '休会中'
    when 'pending'   then '審査待ち'
    when 'left'      then '退会'
    when 'rejected'  then '否認'
    else m.status
  end                                      as status_label,
  (m.status in ('active', 'suspended'))    as is_active,
  m.join_date,
  m.start_date,
  m.leave_date,
  m.scheduled_leave_date,
  m.suspend_start,
  m.suspend_end,
  m.payment_method,
  m.billing_status,
  m.join_campaign,
  m.gender,
  case when m.birth_date is not null
       then extract(year from age(current_date, m.birth_date))::int end as age,
  m.occupation,
  m.company_name,
  m.created_at,
  s.name                                   as store_name,
  m.store_id
from frunk_members m
  left join frunk_plans p on p.id = m.plan_id
  left join stores      s on s.id = m.store_id
where m.company_id = gn_ctx_company()
  and m.deleted_at is null
  and gn_store_ok(m.store_id);

comment on view gnv_frank_members is
  'Ask Data: FRANK GOLF の会員（frunk_members）。gnv_members は GOLF WING のみ。'
  '在籍 = is_active（active＋休会中）。一般会員数は plan_type=''一般'' かつ status=''active''。';

-- ------------------------------------------------------------
-- 権限: Ask Data の実行ロールだけに見せる（0064 の方針）
-- ------------------------------------------------------------
revoke all on gnv_frank_members from public, anon, authenticated;
grant select on gnv_frank_members to gn_chat_reader;

revoke all on gnv_bookings, gnv_walkins, gnv_orders from public, anon, authenticated;
grant select on gnv_bookings, gnv_walkins, gnv_orders to gn_chat_reader;
