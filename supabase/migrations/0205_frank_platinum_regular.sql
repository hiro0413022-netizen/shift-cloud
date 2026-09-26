-- 0205: プラチナレギュラープラン（#281・2026-09-26 ユーザー指示）
--
-- ユーザー指示:「佐々木が金額はレギュラープランですがマスター会員資格になります。
--   プラチナレギュラープランとしてます。レギュラー会費で2コマ取れる特別プランになります」
--
-- 中身: 月会費＝レギュラー（13,800円税抜／15,180円税込）／1日の上限＝マスター相当（2コマ＝2時間）
--
-- ★ Squareのバリエーションはレギュラーと同じものを指す（V7SPLVJ4...）。
--   月額が同じ13,800円なので、Square側では同じ商品で正しい。これにより
--   **すでに立っている佐々木様のサブスクを作り直さなくてよい**（金額も請求日も変わらない）。
--   別バリエーションを作ると、同額なのに2つの商品が並び、作り直しのときに取り違える。
--
-- ★ public_signup = false（Web入会フォームには出さない）
--   個別のお約束で作った特別プランなので、一般の方が選べてはいけない。
--   #195 の方針どおり、画面に出さないだけでなく直接POSTされても通らない。
--
-- ★ billable = true（課金対象に数える・#280 の会員数カウント）。
--   月会費をいただいているので、スタッフ・モニターとは違う。
--
-- ⚠ 1日の上限の判定は frunk_plans.max_bookings_per_day × 60分（apps/genesis/src/lib/frank-booking.ts）。
--   「2コマ」は max_bookings_per_day = 2 で表す。月4回の制限はプラン名が「ライト会員」の行だけに
--   かかる作りなので、この名前なら月の回数制限は付かない（全営業日ご利用いただける）。

insert into public.frunk_plans (
  company_id, store_id, name, monthly_price, joining_fee,
  max_bookings_per_day, max_bookings_per_week, max_open_slots,
  is_corporate, max_users, companion_free,
  public_signup, active, billable, sort_order,
  square_variation_id, square_variation_nofee_id, note
)
select
  r.company_id, r.store_id, 'プラチナレギュラープラン', r.monthly_price, r.joining_fee,
  2, null, 2,
  false, null, false,
  false, true, true, 3,
  r.square_variation_id, r.square_variation_nofee_id,
  'レギュラー会費でマスター相当（1日2コマ＝2時間）の特別プラン。個別のお約束のため Web入会フォームには出さない。Squareのバリエーションはレギュラーと同一（月額が同じ）'
from public.frunk_plans r
where r.name = 'レギュラー会員' and r.store_id = 'b54afb9f-22aa-4f4e-b758-bc2157acfdd5' and r.deleted_at is null
  and not exists (
    select 1 from public.frunk_plans x
    where x.name = 'プラチナレギュラープラン' and x.store_id = r.store_id and x.deleted_at is null
  );

-- 並びを「ライト→レギュラー→プラチナレギュラー→マスター→法人」に整える
update public.frunk_plans set sort_order = 4, updated_at = now()
  where name = 'マスター会員' and store_id = 'b54afb9f-22aa-4f4e-b758-bc2157acfdd5' and deleted_at is null;
update public.frunk_plans set sort_order = 5, updated_at = now()
  where name = '法人ライトプラン' and store_id = 'b54afb9f-22aa-4f4e-b758-bc2157acfdd5' and deleted_at is null;
update public.frunk_plans set sort_order = 6, updated_at = now()
  where name = '法人プレミアムプラン' and store_id = 'b54afb9f-22aa-4f4e-b758-bc2157acfdd5' and deleted_at is null;

-- 佐々木 昌也様（FR0059）をこのプランへ。
-- ★ 月会費が同額なので、プラン変更の週割差額（#124）もSquareの作り直しも要らない。
--   画面のプラン変更フローを通すと0円の差額請求やサブスクの入れ替えが走るので、ここで直接付け替える。
update public.frunk_members m set
  plan_id = (select id from public.frunk_plans p
             where p.name = 'プラチナレギュラープラン' and p.store_id = m.store_id and p.deleted_at is null),
  updated_at = now()
where m.member_no = 'FR0059'
  and m.store_id = 'b54afb9f-22aa-4f4e-b758-bc2157acfdd5'
  and m.deleted_at is null;
