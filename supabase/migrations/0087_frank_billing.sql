-- 0087: FRANK GOLF 月会費の継続課金（Stripe）#97
-- 会員がサイト booking.html からカードを登録すると、Stripe Checkout(subscription) で
-- 月会費（税込）が毎月自動課金される。Webhookで状態を frunk_members に反映する。

alter table frunk_members
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_status text not null default 'none'
    check (billing_status in ('none','checkout','active','past_due','canceled')),
  add column if not exists billing_registered_at timestamptz;

comment on column frunk_members.billing_status is
  'Stripe継続課金の状態: none=未登録 / checkout=登録手続き中 / active=課金中 / past_due=支払失敗 / canceled=解約';

create index if not exists idx_frunk_members_stripe_customer
  on frunk_members (stripe_customer_id) where stripe_customer_id is not null;
