-- ============================================================
-- 0135: 予約・受付台帳を「データに聞く」で答えられるようにする＋JARVISの実行枠
--
-- 背景（2026-08-29 ユーザー）:
--   「このGENESISに例えば予約状況などを聞いても返答してくれますか？
--     要はすべてのシステムの情報読み取り、予約追加などの操作をできるようにしたい」
--
--   確認したら **答えられなかった**。0053 で作った gnv_* に
--   予約のビューが1つも無く、LLMには「存在しないもの」として見えていた。
--   予約は frunk_bookings（23件が9/2以降に入っている）に実在するのに、
--   聞くと CANNOT_ANSWER が返る状態だった。
--
-- あわせて見つけた不具合:
--   gnv_trials が **mbr_trial_bookings（0行の空テーブル）** を読んでいた。
--   体験数の正は mbr_walkin_visits(visit_type='trial')（2026-07-25 の決定・706dc1b）。
--   つまり「体験は何件？」と聞くと **黙って0件と答えていた**。
--   Ask Data の柱は「数字はPostgresが計算する」だが、
--   **読む場所が間違っていれば正しく0を返してしまう**。ここを直す。
--
-- security_invoker は付けない（0053 と同じ）＝ビュー所有者権限で動き、
-- スコープ制御は where 句の gn_ctx_company() / gn_store_ok() が担う。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 打席予約（FRANK GOLF）
--    正典は frunk_bookings 1本（0084/#93）。空き判定は status<>'cancelled'。
-- ------------------------------------------------------------
create or replace view gnv_bookings as
select
  b.booked_date,
  b.start_time,
  b.end_time,
  b.status,
  b.source,
  b.customer_kind,
  coalesce(m.member_name, b.guest_name)      as customer_name,
  m.member_no,
  b.guest_phone,
  b.party_size,
  b.amount,
  b.paid_amount,
  b.payment_status,
  b.payment_method,
  b.note,
  b.created_at,
  y.name  as bay_name,
  s.name  as store_name,
  b.store_id
from frunk_bookings b
  left join frunk_bays y on y.id = b.bay_id
  left join stores    s on s.id = b.store_id
  left join (
    select id, member_no, name as member_name from frunk_members where deleted_at is null
  ) m on m.id = b.member_id
where b.company_id = gn_ctx_company()
  and b.deleted_at is null
  and gn_store_ok(b.store_id);

comment on view gnv_bookings is '打席予約（FRANK GOLF）。キャンセルは status=cancelled で残っているので、空き状況を見るときは除くこと';

-- ------------------------------------------------------------
-- 2. 受付台帳（来店・体験）
--    体験数の正はここ（visit_type='trial'）。mbr_trial_bookings ではない。
-- ------------------------------------------------------------
create or replace view gnv_walkins as
select
  w.visit_seq,
  w.visited_on,
  w.visit_type,
  w.fee,
  w.discount,
  w.payment_method,
  w.pro_staff,
  w.result,
  w.repeat_date,
  w.reapproach_date,
  w.referral_source,
  w.follow_up_at,
  w.follow_up_channel,
  w.note,
  w.created_at,
  g.name        as guest_name,
  g.name_kana   as guest_kana,
  g.gender,
  g.birth_date,
  s.name        as store_name,
  w.store_id
from mbr_walkin_visits w
  left join mbr_guests g on g.id = w.guest_id
  left join stores     s on s.id = w.store_id
where w.company_id = gn_ctx_company()
  and w.deleted_at is null
  and gn_store_ok(w.store_id);

comment on view gnv_walkins is '受付台帳（来店・体験）。体験数は visit_type=''trial''、入会は result=''join''';

-- ------------------------------------------------------------
-- 3. モバイルオーダー（FRANK）
-- ------------------------------------------------------------
create or replace view gnv_orders as
select
  o.order_no,
  o.ordered_on,
  o.ordered_at,
  o.status,
  o.subtotal,                       -- 税抜
  o.tax_amount,
  o.amount,                         -- 税込（お客様が払う額）
  o.payment_status,
  o.source,
  y.name as bay_name,
  coalesce(m.member_name, o.guest_label) as customer_name,
  s.name as store_name,
  o.store_id
from frunk_orders o
  left join frunk_bays y on y.id = o.bay_id
  left join stores     s on s.id = o.store_id
  left join (
    select id, name as member_name from frunk_members where deleted_at is null
  ) m on m.id = o.member_id
where o.company_id = gn_ctx_company()
  and o.deleted_at is null
  and gn_store_ok(o.store_id);

comment on view gnv_orders is 'モバイルオーダー（FRANK）。金額は税抜subtotal＋tax_amount＝amount（税込・#166）';

-- ------------------------------------------------------------
-- 4. gnv_trials を正しい元データに向け直す
--    列の形は変えない（既存の質問文・カタログを壊さないため）。
-- ------------------------------------------------------------
create or replace view gnv_trials as
select
  w.visit_seq                       as booking_seq,
  coalesce(w.visit_type, 'trial')   as program,
  w.visited_on                      as lesson_date,
  null::time                        as start_time,
  case when w.result is null or w.result = '' then 'visited' else w.result end as status,
  (w.result = 'join')               as joined,
  case when w.result = 'join' then w.visited_on end as joined_at,
  case when w.result <> 'join' then w.result end    as decline_reason,
  w.referral_source                 as source,
  w.created_at,
  w.store_id,
  s.name as store_name
from mbr_walkin_visits w
  left join stores s on s.id = w.store_id
where w.company_id = gn_ctx_company()
  and w.deleted_at is null
  and w.visit_type = 'trial'
  and gn_store_ok(w.store_id);

comment on view gnv_trials is '体験レッスン。元データは mbr_walkin_visits(visit_type=trial)。0135以前は空テーブル mbr_trial_bookings を読んでいて常に0件だった';

-- ------------------------------------------------------------
-- 5. JARVISが実行してよい操作（#186）
--    ユーザー判断（2026-08-29）: 「取消枠（入るが数分は戻せる）」。
--    入れてから5分間はホームの「実行予定」に出て取り消せる。
--
--    ⚠ お客様への送信・課金・契約は auto_undo にしない（VISION §7）。
--       line_broadcast / customer_message / payment は approval のまま。
--       staff_directive（社内スタッフへの公式LINE）だけ、ユーザー判断で
--       approval → auto_undo(5分) に変更する。
-- ------------------------------------------------------------
insert into ai_execution_policies (company_id, action_type, mode, undo_minutes)
select c.id, v.action_type, v.mode, v.undo_minutes
from companies c
cross join (values
  ('booking_create', 'auto_undo', 5),
  ('booking_cancel', 'auto_undo', 5),
  ('walkin_add',     'auto_undo', 5)
) as v(action_type, mode, undo_minutes)
on conflict (company_id, action_type) do update
  set mode = excluded.mode, undo_minutes = excluded.undo_minutes;

update ai_execution_policies
set mode = 'auto_undo', undo_minutes = 5
where action_type = 'staff_directive';
