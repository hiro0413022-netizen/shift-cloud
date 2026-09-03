-- #209 (2026-09-03) 会員ページに出す「コーチの出勤予定」の出演者をオプトインで決める
--
-- ユーザー指示:「会員ページにプロの出勤状況を確認できるようにしてください。藤田プロは絶対に表示しないように」
--
-- ★ 除外リスト（この人は出さない）ではなく、オプトイン（この人だけ出す）にした。
--   除外リストは「新しく入ったスタッフ」「店舗ログイン用のアカウント」が既定でお客様に出てしまう。
--   空 = 出さない。出すと決めた人にだけ肩書き（コーチ／スタッフ）を入れる。
--   ＝ 藤田プロは何もしなければ絶対に出ない。

alter table public.staff add column if not exists member_page_role text;

comment on column public.staff.member_page_role is
  '会員ページの出勤予定に出すときの肩書き（例: コーチ／スタッフ）。空＝出さない（オプトイン・#209）';

-- 初期設定（FRANK GOLF 姫路）
update public.staff set member_page_role = 'コーチ'   where name in ('小川うらら', '穴田 賢太') and member_page_role is null;
update public.staff set member_page_role = 'スタッフ' where name in ('林 和希')                and member_page_role is null;
