-- 適用済み: 2026-09-12（Supabase migration名 craft_os_member_kind_staff / craft_os_rules_user_decisions_0912）
-- ユーザー判断（2026-09-12）を反映する。
--  ① お客様区分に「スタッフ」を追加。スタッフ購入は仕入値（商品マスタの default_rate）で自動 → ルール表では持たない
--  ② お客様区分に visitor_no_fitting（フィッティング歴のない一見のビジター）を追加
--  ③ クラブのビジターは原則 割引なし。フィッティングを受けたことがある方・旧会員などは 20%OFF
--     （率は人によって変わるため、画面の明細で打ち替えられるようにしてある）
--  ④ ボールはタイトリストのみ割引なし。他メーカーは会員10%OFF

alter table golfwing.discount_rules drop constraint if exists discount_rules_member_kind_check;
alter table golfwing.discount_rules add constraint discount_rules_member_kind_check
  check (member_kind is null or member_kind in ('会員','ビジター','スタッフ'));

alter table golfwing.quotes drop constraint if exists quotes_member_kind_check;
alter table golfwing.quotes add constraint quotes_member_kind_check
  check (member_kind in ('会員','ビジター','スタッフ'));

alter table golfwing.discount_rules drop constraint if exists discount_rules_segment_check;
alter table golfwing.discount_rules add constraint discount_rules_segment_check
  check (segment is null or segment in
    ('visitor_no_fitting','visitor_or_intro','member_paid_fitting','from_demo_or_lesson'));

alter table golfwing.quotes drop constraint if exists quotes_segment_check;
alter table golfwing.quotes add constraint quotes_segment_check
  check (segment in ('visitor_no_fitting','visitor_or_intro','member_paid_fitting','from_demo_or_lesson'));

comment on column golfwing.quotes.member_kind is
  '会員／ビジター／スタッフ。スタッフは商品マスタの default_rate（仕入掛け率）で出す';
comment on column golfwing.quotes.segment is
  'お客様区分。visitor_no_fitting=フィッティング歴のない一見のビジター／visitor_or_intro=ビジター（フィッティング歴あり）・プロ紹介・再フィッティングの会員・旧会員／member_paid_fitting=フィッティング料を支払った会員／from_demo_or_lesson=試打からの購入・レッスン時のご購入';

delete from golfwing.discount_rules where item_category='クラブ' and member_kind='ビジター';
insert into golfwing.discount_rules
  (company_id, item_category, manufacturer, segment, member_kind, rate, priority, note)
values
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ',null,'visitor_no_fitting','ビジター',1.00,0,'一見のビジターは割引なし（2026-09-12 ユーザー判断。実績も1.00が最多）'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ',null,'visitor_or_intro','ビジター',0.80,5,'フィッティングを受けたことがある方・旧会員など（2026-09-12 ユーザー判断）。人により変わるため明細で打ち替え可'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ',null,'from_demo_or_lesson','ビジター',0.80,5,'試打からのご購入のビジター'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ',null,'member_paid_fitting','ビジター',0.80,5,'フィッティング料をお支払いのビジター');

insert into golfwing.discount_rules
  (company_id, item_category, manufacturer, segment, member_kind, rate, priority, note)
values
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト',null,'visitor_no_fitting',null,0.80,0,'割引率表の「ビジター」列と同じ'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト','REVE','visitor_no_fitting',null,0.85,10,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト','ワクチンコンポ','visitor_no_fitting',null,0.85,10,null);

delete from golfwing.discount_rules where item_category='ボール';
insert into golfwing.discount_rules
  (company_id, item_category, manufacturer, segment, member_kind, rate, priority, note)
values
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','ボール',null,null,'会員',0.90,0,'他メーカーのボールは会員10%OFF（2026-09-12 ユーザー判断。ブリヂストンの実績19件と一致）'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','ボール',null,null,'ビジター',1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','ボール','タイトリスト',null,null,1.00,10,'タイトリストは割引なし（見積のルール）');

comment on table golfwing.discount_rules is
  '割引ルール。掛け率で持つ（0.80=20%OFF）。シャフト・クラブは segment、グリップ等は member_kind で引く。適用は @yozan/core/fitting-quote。スタッフ購入だけは例外で、商品マスタの default_rate（仕入掛け率）を使う';
