-- 0105: FRANK GOLF 月会費を Stripe → Square に一本化（#123）
-- 会員に Square の顧客/サブスク/決済リンク注文IDを持たせ、プランに Square のプランバリエーションIDを持たせる。
-- stripe_* 列は履歴として残す（テストモードのみで実課金なし）。

alter table frunk_members
  add column if not exists square_customer_id text,
  add column if not exists square_subscription_id text,
  add column if not exists square_checkout_order_id text;

alter table frunk_plans
  add column if not exists square_variation_id text;

-- Webhookで payment.order_id / payment.customer_id から会員を引くための索引
create index if not exists idx_frunk_members_square_customer
  on frunk_members (square_customer_id) where square_customer_id is not null;
create index if not exists idx_frunk_members_square_checkout_order
  on frunk_members (square_checkout_order_id) where square_checkout_order_id is not null;

comment on column frunk_members.square_customer_id is 'Square顧客ID（サブスク決済完了時にWebhookで確定）';
comment on column frunk_members.square_subscription_id is 'Square月会費サブスクリプションID';
comment on column frunk_members.square_checkout_order_id is 'Square決済リンクの注文ID（初回決済と会員を紐付けるための鍵）';
comment on column frunk_plans.square_variation_id is 'Squareサブスクプランのバリエーションid（scripts/frank-square-setup.mjs が発行）';
