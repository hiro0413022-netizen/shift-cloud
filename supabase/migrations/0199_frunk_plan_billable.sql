-- 0199: プランに「課金対象か」を持たせる（#273・2026-09-24 ユーザー指示）
--
-- ねらい: 会員一覧の見出しが「在籍 58名」で、そこにスタッフ6名・モニター1名・
--   法人のご利用者23名が全部足されていた。月会費をいただいているのは28名。
--   数字を見て打ち手を決める画面（GENESISの会員数・事業別PL）も同じ数え方だったので、
--   「請求が立つプランか」をプラン側の1列にして、全画面が同じ数を見るようにする。
--
-- 列にする理由: 月会費0円=課金対象外、で済むうちは式でよかったが、テスト会員（100円）のように
--   「お金は動くが会員数には入れたくない」ものが出てきた。画面から切り替えられる1列にしておく
--   （max_open_slots と同じ考え方＝デプロイなしで直せる）。

alter table public.frunk_plans
  add column if not exists billable boolean not null default true;

comment on column public.frunk_plans.billable is
  '会員数（課金対象）に数えるプランか。スタッフ・モニター・テスト会員は false。月会費0円でも明示的に持つ';

-- 既存: 月会費0円のプラン（スタッフ・モニター）とテスト会員を課金対象から外す
update public.frunk_plans
set billable = false
where deleted_at is null
  and (coalesce(monthly_price, 0) = 0 or name = 'テスト会員');
