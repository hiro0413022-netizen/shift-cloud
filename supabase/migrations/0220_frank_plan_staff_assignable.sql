-- 0220: スタッフが会員カードから選べるプランを絞る（#331）
--
-- きっかけ: プラチナレギュラープラン（レギュラー会費で2コマ取れる特別プラン・#281）は
--   佐々木様だけの個別対応なのに、会員カードの「プランを変更…」に全員ぶん並んでいた。
--
-- public_signup は「お客様が自分で申し込めるか」。
-- staff_assignable は「スタッフが会員カードから付け替えられるか」。別物として持つ。
--   false のプランはオーナー（manage_company）だけが選べる＝現場では選べない。

alter table frunk_plans
  add column if not exists staff_assignable boolean not null default true;

comment on column frunk_plans.staff_assignable is
  'スタッフが会員カードから付け替えてよいプランか。false は個別対応専用（オーナーのみ選択可）';

-- 個別対応専用のプランを閉じる（いまは佐々木様だけのプラチナレギュラープラン）
update frunk_plans
   set staff_assignable = false,
       updated_at = now()
 where deleted_at is null
   and name = 'プラチナレギュラープラン';
