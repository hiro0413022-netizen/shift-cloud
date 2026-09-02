-- #195 (2026-09-01) FRANK 法人プラン（法人ライト／法人プレミアム）
--
-- ユーザー依頼: 「法人ライトとプレミア会員の登録ができるようにしてください」
--
-- 決めたこと（ユーザー確定）:
--   利用者   申込時に全員分を入力する（登録は必須）。ライト最大2名・プレミアム最大4名
--   予約     まだ消化していない予約として同時に持てるのは ライト4コマ・プレミアム8コマ（法人合計）。
--            1日で8コマ取ったら、消化するまで翌日以降は取れない。
--            この「消化してから次を取る」は **全会員共通**（個人プランも同じ判定を通す）
--   申込欄   会社名・ご担当者名・請求先の住所/メール
--   同伴     ライトは同伴なし／プレミアムは同伴ビジター無料（回数制限なし）
--
-- ついでの事故修正: 入会フォームは active なプランを全部出していたため、
--   note に「一般公開しない」と書いてある テスト会員(100円)・スタッフ(0円)・モニター会員(0円) が
--   お客様の画面に並んでいた。active とは別に public_signup を持たせて塞ぐ。

alter table frunk_plans
  add column if not exists is_corporate   boolean not null default false,
  add column if not exists max_users      integer,
  add column if not exists max_open_slots integer,
  add column if not exists companion_free boolean not null default false,
  add column if not exists public_signup  boolean not null default true;

comment on column frunk_plans.is_corporate is '法人プラン。契約者1人にサブスク1本・利用者を複数ぶら下げる';
comment on column frunk_plans.max_users is '法人プランで登録できる利用者の上限（法人ライト2・法人プレミアム4）';
comment on column frunk_plans.max_open_slots is
  'まだ消化していない予約として同時に持てるコマ数（1コマ=1時間）。消化するまで次が取れない。法人は登録者全員の合計';
comment on column frunk_plans.companion_free is '同伴ビジターが無料（法人プレミアムのみ）';
comment on column frunk_plans.public_signup is
  'お客様のWeb入会フォームに出すか。テスト会員・スタッフ・モニターは false（activeとは別物）';

alter table frunk_members
  add column if not exists corporate_parent_id  uuid references frunk_members(id),
  add column if not exists company_name         text,
  add column if not exists billing_postal_code  text,
  add column if not exists billing_address1     text,
  add column if not exists billing_email        text,
  add column if not exists corporate_users      jsonb;

comment on column frunk_members.corporate_parent_id is '法人の利用者。契約者（親）の frunk_members.id を指す。親は null';
comment on column frunk_members.company_name is '会社名（法人の契約者行のみ）';
comment on column frunk_members.corporate_users is
  '申込時にいただいた利用者の予定（確定時にこの内容で会員行を作る）。作成後も申込内容の控えとして残す';

create index if not exists idx_frunk_members_corporate_parent
  on frunk_members (corporate_parent_id) where corporate_parent_id is not null;

update frunk_plans set max_open_slots = coalesce(max_bookings_per_day, 1) where max_open_slots is null;

update frunk_plans set is_corporate = true, max_users = 2, max_open_slots = 4, companion_free = false,
       max_bookings_per_day = 4,
       note = '最大2名様まで登録・先の予約は合計4コマまで ※表示は税抜'
 where name = '法人ライトプラン' and deleted_at is null;

update frunk_plans set is_corporate = true, max_users = 4, max_open_slots = 8, companion_free = true,
       max_bookings_per_day = 8,
       note = '最大4名様まで登録・先の予約は合計8コマまで・同伴ビジター無料 ※表示は税抜'
 where name = '法人プレミアムプラン' and deleted_at is null;

update frunk_plans set public_signup = false
 where name in ('テスト会員', 'スタッフ', 'モニター会員') and deleted_at is null;
