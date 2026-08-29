-- 0135_fitting_walkin_link.sql
-- フィッティング予約（Reserve OS / res_requests）→ 受付台帳（mbr_walkin_visits）の連結。
--
-- なぜ必要か（2026-08-29・ユーザー指摘）:
--   フィッティングの申込は Reserve OS に入るだけで、受付台帳には1行も入っていなかった。
--   お客様は予約フォームで名前・電話・クラブ・悩みまで書いているのに、来店するとタブレットで
--   同じことをもう一度書かされていた。
--
-- 決定（ユーザー 2026-08-29）:
--   ・台帳へ載せるのは「スタッフが日程を確定した瞬間」。キャンセル・見送りで自動で下げる。
--   ・来店時のタブレットは無くさない。ただし予約で貰った内容は入力済みで開く（書き直させない）。
--
-- ここで足すもの:
--   1) arrived_at            … 店舗ダッシュボードの「来店」ボタンの打刻
--   2) intake_token_hash     … その1行だけを開ける受付URLの鍵（生トークンは発行時のみ・DBはsha256）
--   3) intake_token_expires_at … 鍵の有効期限（当日限り。放置された端末から開けない）
--   4) find_guest_by_contact … 電話（数字だけ）・メールで既存のお客様を1人だけ引く関数
--      ※ 従来の名寄せは mbr_guests を500件だけ読んで突き合わせていた。GOLF WINGは
--        すでに6,000人規模なので、それでは既存客が新規として二重に増える。

alter table public.mbr_walkin_visits
  add column if not exists arrived_at timestamptz,
  add column if not exists intake_token_hash text,
  add column if not exists intake_token_expires_at timestamptz;

create index if not exists idx_mbr_walkin_visits_intake_token
  on public.mbr_walkin_visits (intake_token_hash)
  where intake_token_hash is not null;

comment on column public.mbr_walkin_visits.arrived_at is
  '来店打刻（店舗ダッシュボードの「来店」ボタン）。予約由来の行は確定時に作られるため、実来店はこの列で判別する。';
comment on column public.mbr_walkin_visits.intake_token_hash is
  'この来店1件だけを開ける受付フォームURLの鍵（sha256）。スタッフが「来店」を押した時に発行する。';
comment on column public.mbr_walkin_visits.intake_token_expires_at is
  '受付URLの有効期限。切れたら開けない（店頭タブレットの放置対策）。';

-- ============================================================
-- 電話・メールで既存のお客様を引く（名寄せの正典）
--   電話は app.digits（0110で定義）で数字だけにして下10桁で比較する。
--   氏名だけでは絶対にくっつけない（同姓同名が普通にいる）。
-- ============================================================
create or replace function find_guest_by_contact(
  p_company_id uuid,
  p_phone text default null,
  p_email text default null
) returns uuid
language sql
security definer
set search_path = public
as $$
  with k as (
    select right(coalesce(app.digits(p_phone), ''), 10) as phone_key,
           lower(btrim(coalesce(p_email, ''))) as mail
  )
  select g.id
  from mbr_guests g, k
  where g.company_id = p_company_id
    and g.deleted_at is null
    and (
      (k.phone_key <> '' and (
         right(coalesce(app.digits(g.phone), ''), 10) = k.phone_key
      or right(coalesce(app.digits(g.mobile), ''), 10) = k.phone_key))
      or
      (k.mail <> '' and lower(btrim(coalesce(g.email, ''))) = k.mail)
    )
  order by g.created_at
  limit 1
$$;

comment on function find_guest_by_contact(uuid, text, text) is
  '電話（下10桁・数字のみ）またはメールで既存の一時利用者を1人引く。台帳の二重登録防止。氏名では引かない。';

grant execute on function find_guest_by_contact(uuid, text, text) to service_role;
