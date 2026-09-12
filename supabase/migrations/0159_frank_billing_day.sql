-- 0159 FRANK 月会費を「毎月10日に翌月分」に（#235・2026-09-11 ユーザー決定）
--
-- Web入会の決済リンクで作られるサブスクは「お支払いの日」が毎月の請求日になる（人によってバラバラ）。
-- 10日払いのサブスクに作り直した状態を会員行に控える。作り直しの実体は apps/genesis/src/lib/frank-billing-day.ts
--
--   billing_day                      … 10 = 10日払いに作り直し済み（null = まだ入会日と同じ日）
--   billing_rebased_at               … 作り直しが完了した時刻
--   billing_rebase_claimed_at        … 作り直しに着手した時刻（Webhook 2本の同時実行を1回にする鍵）
--   billing_rebase_error             … 失敗の理由（会員カードに赤で出す・再実行で消える）
--   square_retired_subscription_ids  … 作り直しで引退させたサブスクID（そのWebhookを無視する）

alter table public.frunk_members
  add column if not exists billing_day smallint,
  add column if not exists billing_rebased_at timestamptz,
  add column if not exists billing_rebase_claimed_at timestamptz,
  add column if not exists billing_rebase_error text,
  add column if not exists square_retired_subscription_ids jsonb not null default '[]'::jsonb;

comment on column public.frunk_members.billing_day is '#235 月会費の引き落とし日。10=毎月10日に翌月分（作り直し済み）';
comment on column public.frunk_members.square_retired_subscription_ids is '#235 10日払いへの作り直しで引退させたSquareサブスクID（Webhookを無視する）';

-- 尾内様（FR0048）・大江様（FR0049）: 無料はご利用開始月（11月）・12月1月は前取り済み・継続はご利用開始日から（#234 ユーザー決定）。
-- 決済リンクの内訳に開始日の控えが無い（#234 より前に発行）ので、ここで控える。
update public.frunk_members
   set square_checkout_breakdown = coalesce(square_checkout_breakdown, '{}'::jsonb) || jsonb_build_object('usageStartYmd', '2026-11-02'),
       min_term_until = date '2027-05-02',
       updated_at = now()
 where member_no in ('FR0048', 'FR0049')
   and start_date = date '2026-11-02'
   and deleted_at is null;
