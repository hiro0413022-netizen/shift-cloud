-- 0113_frank_hardening.sql
-- FRANK GOLF 入会・課金まわりの堅牢化（DECISIONS #136）
--
-- 1. frunk_members.square_checkout_order_ids
--    再送信で決済リンクを作り直すと square_checkout_order_id が上書きされ、
--    お客様が「古いタブに残った決済リンク」で支払うと Webhook が会員を特定できず
--    入会が確定しない事故になる。発行した全 order_id を履歴として持ち、照合に使う。
--
-- 2. frunk_members.square_checkout_breakdown
--    決済リンク発行時に確定した内訳（合計/入会金/月会費/前取り月数/キャンペーン）。
--    Webhook・入会控えPDFは「入金日で再計算」せずこれを読む。
--    （年またぎ・キャンペーン境界・プラン価格変更で再計算がズレる事故の防止）
--
-- 3. mon_sales の Square 決済ID 一意インデックス
--    Square は同一決済を payment.created / payment.updated の両方で通知する。
--    check-then-act の冪等チェックはレースで抜けるため、DBで最終防衛する。
--    Web入会の初回一括は同じ payment_id で「入会金」「月会費」2行に分割する仕様なので
--    detail->>'part' を含めて一意にする。
--
-- 4. frunk_auth_attempts
--    公開API（打席予約・レッスン・課金）の認証は「会員番号＋電話下4桁」。
--    総当たり対策として失敗を記録し、一定回数でロックする（lib/frank-booking.ts）。
--
-- 5. gn_ops_tokens
--    運用ワンショットAPI（Squareプラン同期など）の認証トークン置き場。
--    Vercel env を知らない AI/運用ツールが、DBに登録した使い捨てトークンで
--    保護されたエンドポイントを叩けるようにする（sha256ハッシュのみ保存・期限つき）。

-- ============================================================
-- 1・2. frunk_members
-- ============================================================
alter table frunk_members
  add column if not exists square_checkout_order_ids jsonb not null default '[]'::jsonb;
comment on column frunk_members.square_checkout_order_ids is
  '発行した Square 決済リンクの order_id 履歴（最新は square_checkout_order_id にも入る）。Webhookの会員特定に使う';

alter table frunk_members
  add column if not exists square_checkout_breakdown jsonb;
comment on column frunk_members.square_checkout_breakdown is
  '決済リンク発行時に確定した内訳 {total, joiningFee, monthly, prepaidMonths, campaign, applyDateYmd}。Webhook/控えPDFはこれを正とする';

-- 既存の単一 order_id を履歴へバックフィル
update frunk_members
   set square_checkout_order_ids = jsonb_build_array(square_checkout_order_id)
 where square_checkout_order_id is not null
   and square_checkout_order_ids = '[]'::jsonb;

create index if not exists frunk_members_checkout_orders_idx
  on frunk_members using gin (square_checkout_order_ids);

-- ============================================================
-- 3. mon_sales 冪等の最終防衛
-- ============================================================
create unique index if not exists mon_sales_square_payment_uniq
  on mon_sales ((detail->>'square_payment_id'), (coalesce(detail->>'part', '')))
  where detail->>'square_payment_id' is not null;

create unique index if not exists mon_sales_square_refund_uniq
  on mon_sales ((detail->>'square_refund_id'))
  where detail->>'square_refund_id' is not null;

-- ============================================================
-- 4. 認証試行の記録（総当たり対策）
-- ============================================================
create table if not exists frunk_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  member_no text not null,
  ip text,
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);
comment on table frunk_auth_attempts is
  'FRANK公開API（会員番号＋電話下4桁）の認証試行ログ。15分10回失敗でロック（frank-booking.ts）';

create index if not exists frunk_auth_attempts_member_time_idx
  on frunk_auth_attempts (member_no, attempted_at desc);

alter table frunk_auth_attempts enable row level security; -- service_role のみ（ポリシー無し）

-- 古い行の掃除は不要（量が問題になったら cron で削除。まずは残す＝監査に使える）

-- ============================================================
-- 5. 運用ワンショットAPIのトークン
-- ============================================================
create table if not exists gn_ops_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,      -- sha256(hex)。平文は保存しない
  purpose text not null,                -- 例: 'frank_square_plan_sync'
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table gn_ops_tokens is
  '運用ワンショットAPIの使い捨てトークン（sha256のみ・期限つき）。例: /api/public/frank/admin/square-plan-sync';

alter table gn_ops_tokens enable row level security; -- service_role のみ（ポリシー無し）
