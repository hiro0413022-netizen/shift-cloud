-- 0222: 追加練習チケット（55分 2,750円税込・#332）
--
-- 発端: ユーザー依頼「通常の予約枠を利用した後、次の時間に空きがあれば、
--   チケットを購入して追加で練習できる制度」。
--
-- ★ 台帳は作らない。買うのと使うのが同時なので、残枚数という概念が無い。
--   記録は予約そのもの（frunk_bookings.customer_kind='extra'）。
--   打席を押さえないと練習できないので、予約は必ず立つ＝数え漏れが起きない。
--
-- ★ 月会費の上限には数えない（ユーザー決定）。除外はアプリ側（frank-booking.ts）で行う。
--   DBで縛ると、スタッフが店頭で入れる道まで塞がる。

-- 1) 追加練習の予約を入れられるようにする
alter table frunk_bookings
  drop constraint if exists frunk_bookings_customer_kind_chk;
alter table frunk_bookings
  add constraint frunk_bookings_customer_kind_chk
  check (customer_kind in ('member', 'trial', 'dropin', 'extra'));

comment on column frunk_bookings.customer_kind is
  'member=会員 / trial=体験 / dropin=都度利用 / extra=追加練習（55分2,750円・別料金。プランの上限に数えない）';

-- 2) どのプランが追加練習を買えるか
--    プラン名で分岐すると料金改定やプラン追加のたびにコードを直すことになるので、列で持つ。
--    対象（2026-10-03 ユーザー確定）:
--      レギュラー会員 / マスター会員
--      プラチナレギュラープラン（#281 佐々木様。レギュラー会費でマスター資格の特別プラン）
--      法人ライトプラン / 法人プレミアムプラン（2026-10-03 「法人プランも追加可能」）
--    対象外: ライト会員（平日10-15・月4回の制限があるプラン）、スタッフ・テスト・モニター
alter table frunk_plans
  add column if not exists extra_practice_ok boolean not null default false;

comment on column frunk_plans.extra_practice_ok is
  '追加練習チケット（55分2,750円）を店頭で買えるプランか。ライト会員とスタッフ・テスト・モニターは対象外';

update frunk_plans
   set extra_practice_ok = true,
       updated_at = now()
 where deleted_at is null
   and name in (
     'レギュラー会員',
     'マスター会員',
     'プラチナレギュラープラン',
     '法人ライトプラン',
     '法人プレミアムプラン'
   );

-- 3) 月ごとの利用枠数をすぐ数えられるように（会員カードの「今月◯枠」用）
create index if not exists idx_frunk_bookings_extra
  on frunk_bookings (company_id, member_id, booked_date)
  where customer_kind = 'extra' and deleted_at is null;
