-- 0106: FRANK GOLF 入会金10,000円（税抜）＋クーポン＋プラン変更/休会（#124）
-- 入会金はWebカード登録の初回請求に含める（Square側は「入会金あり/なし」の2バリエーション）。
-- クーポンは /join-web で入力し、会員行に控える（カード登録時に「なし」側を使う鍵）。

alter table frunk_members
  add column if not exists joining_fee_coupon text,
  add column if not exists joining_fee_waived boolean not null default false,
  add column if not exists joining_fee_charged_at timestamptz;

comment on column frunk_members.joining_fee_charged_at is '入会金をカードへ自動請求した日時（二重請求ガード・#124）';

alter table frunk_plans
  add column if not exists square_variation_nofee_id text;

comment on column frunk_members.joining_fee_coupon is '入会申込時に入力されたクーポンコード（検証済みのみ保存）';
comment on column frunk_members.joining_fee_waived is 'true=入会金なしでカード登録させる（クーポン適用）';
comment on column frunk_plans.square_variation_nofee_id is 'Squareサブスクの入会金なしバリエーションid（クーポン適用・プラン変更のスワップ先）';

-- 入会金の正式決定: 10,000円（税抜）。モニター(0円プラン)は対象外
update frunk_plans set joining_fee = 10000
 where deleted_at is null and coalesce(monthly_price, 0) > 0 and joining_fee is null;
