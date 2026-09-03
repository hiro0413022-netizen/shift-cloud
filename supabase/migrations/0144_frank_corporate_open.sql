-- #206 (2026-09-03) FRANK 法人プランを「無記名」で入会できるようにする
--
-- ユーザー依頼:
--   「法人の入会が記名制になっている。無記名で使えるようにしたい。
--     利用者登録は会員ページで追加できるように。会員表記は法人名＋個人名。
--     利用する人は利用者登録を必須に。法人名義での予約数も表示してほしい」
--
-- 何が困っていたか:
--   入会フォームがご利用者のお名前・電話番号を必須にしていたため、
--   「まだ誰が使うか決まっていない」会社はお申し込みができなかった。
--   人事異動のたびに店舗へ連絡が必要で、会社側では何も直せなかった。
--
-- 決めたこと（ユーザー確定 2026-09-03）:
--   入会    会社名・ご担当者・請求先だけで申し込める（ご利用者は0名でよい）
--   利用者  ご契約者が **会員ページ** から追加・削除できる（店頭連絡は不要）
--   人数    法人ライト 2名まで ／ 法人プレミアム 無制限（max_users が null = 無制限）
--   契約者  ご担当者ご自身も使うなら「ご利用者として登録」が必要
--           （corporate_self_use。登録が無い契約者の行では予約を受け付けない）
--   表記    法人の方は「会社名＋お名前」で表示する
--   予約    上限は今までどおり御社合計（ライト4コマ・プレミアム8コマ）。
--           埋まっている状態を画面に必ず出す（誰かが押さえ切ると他の方が取れないため）

-- ① 利用者の人数上限: null = 無制限 に意味を変える
comment on column frunk_plans.max_users is
  '法人プランで登録できるご利用者の上限。null = 無制限（法人ライト2・法人プレミアムはnull）';

update frunk_plans set max_users = 2    where name = '法人ライトプラン'     and deleted_at is null;
update frunk_plans set max_users = null where name = '法人プレミアムプラン' and deleted_at is null;

update frunk_plans set note = '最大2名様まで登録・先の予約は御社合計4コマまで ※表示は税抜'
 where name = '法人ライトプラン' and deleted_at is null;
update frunk_plans set note = 'ご登録人数に制限なし・先の予約は御社合計8コマまで・同伴ビジター無料 ※表示は税抜'
 where name = '法人プレミアムプラン' and deleted_at is null;

-- ② ご担当者ご自身も使うか（契約者の行だけが持つ）
alter table frunk_members
  add column if not exists corporate_self_use boolean not null default false;

comment on column frunk_members.corporate_self_use is
  '法人のご契約者ご自身もご利用者として登録済みか。false のあいだ、この行では予約を受け付けない（お支払い専用）。人数上限にも1名として数える';

-- ③ すでにお申し込みいただいている法人は、ご担当者を利用者として扱う
--    （#195 の申込フォームは「ご担当者様がご利用になる場合は同じ内容をご入力ください」と
--      案内していたため、契約者行で予約できる前提で運用が始まっている。
--      ここで false にすると、その方が明日から予約できなくなる）
update frunk_members m
   set corporate_self_use = true
  from frunk_plans p
 where m.plan_id = p.id
   and p.is_corporate = true
   and m.corporate_parent_id is null
   and m.deleted_at is null;

-- ④ 法人のご利用者を「誰の下か」で数えるので、親ごとの検索を速くする（#195 の索引を再確認）
create index if not exists idx_frunk_members_corporate_parent
  on frunk_members (corporate_parent_id) where corporate_parent_id is not null;
