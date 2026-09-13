-- 適用済み: 2026-09-12（Supabase migration名 craft_os_seed_rules）
-- 工賃マスタと割引ルールの初期投入。
-- 出典: 00_雛形.xlsm の隠しシート「見積のルール」「シャフト割引率」、および「2026 クラブ価格一覧」。
-- ※ 割引ルールはこの後 0163 でユーザー判断を反映して一部差し替えている。

alter table golfwing.labor_rates add column if not exists discount_category text not null default '工賃';
comment on column golfwing.labor_rates.discount_category is '割引ルールを引くときのカテゴリ（工賃／ハドラス）';

insert into golfwing.labor_rates
  (company_id, code, name, price, price_bring_in, price_no_purchase, unit, quote_section, discount_category, price_note, sort_order)
values
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','assembly_set','クラブ一式組み立て',null,null,null,'本','工賃','工賃','金額は要確認（Excelの見積書では都度手入力だった）',10),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','grip_mount','グリップ装着',0,500,500,'本','工賃','工賃','商品購入時は無料／持ち込みは500円',20),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','sleeve_mount','スリーブ装着',0,0,500,'本','工賃','工賃','「見積のルール」を採用（グリップシートの「持ち込みのみ500」とは食い違う・要確認）',30),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','sleeve_remove','スリーブ外し',0,0,500,'本','工賃','工賃',null,35),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','shaft_cut','シャフトカット調整',500,null,null,'本','工賃','工賃','Money OSの実績が500円',40),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','direct_pull','直挿しされたシャフトの抜き',0,0,500,'本','工賃','工賃',null,50),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','direct_insert','直挿しされたシャフトの挿し',0,0,500,'本','工賃','工賃',null,55),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','other_work','その他特別作業',null,1000,1000,'回','工賃','工賃','1,000〜要相談',90),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','hadras_head_dr','ハドラスコーティング ヘッド（DR）',3500,null,null,'本','加工部品','ハドラス',null,110),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','hadras_head_fwut','ハドラスコーティング ヘッド（FW/UT）',3000,null,null,'本','加工部品','ハドラス',null,120),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','hadras_shaft','ハドラスコーティング カーボンシャフト（DR/FW/UT）',1500,null,null,'本','加工部品','ハドラス',null,130),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','hadras_iron_set','ハドラスコーティング ヘッド＋シャフト（アイアン・ウエッジ・パター）',2500,null,null,'本','加工部品','ハドラス','カーボン・スチール共に',140),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','hadras_shoes','ハドラスコーティング シューズ',4000,null,null,'足','加工部品','ハドラス',null,150),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','hadras_sunglass','ハドラスコーティング サングラス',1500,null,null,'個','加工部品','ハドラス',null,160)
on conflict (company_id, code) do nothing;

insert into golfwing.discount_rules
  (company_id, item_category, manufacturer, segment, member_kind, rate, priority, note)
values
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト',null,'visitor_or_intro',null,0.80,0,'ビジター／プロ紹介フィッティング／再フィッティングの会員'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト',null,'member_paid_fitting',null,0.70,0,'フィッティング料金を支払った会員'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト',null,'from_demo_or_lesson',null,0.90,0,'試打からの購入／会員がレッスン時に購入'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト','REVE','visitor_or_intro',null,0.85,10,'REVEは5%低い'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト','REVE','member_paid_fitting',null,0.75,10,'REVEは5%低い'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト','REVE','from_demo_or_lesson',null,0.95,10,'REVEは5%低い'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト','ワクチンコンポ','visitor_or_intro',null,0.85,10,'割引率表に記載。商品マスタに未登録'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト','ワクチンコンポ','member_paid_fitting',null,0.75,10,'割引率表に記載。商品マスタに未登録'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','シャフト','ワクチンコンポ','from_demo_or_lesson',null,0.95,10,'割引率表に記載。商品マスタに未登録'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ',null,null,'ビジター',0.90,0,'※0163で差し替え'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ',null,null,'会員',0.85,0,'PING・キャロウェイ・テーラーメイドの標準'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ','タイトリスト',null,'ビジター',0.85,10,'※0163で削除'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ','タイトリスト',null,'会員',0.80,10,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ','COBRA',null,'ビジター',1.00,10,'※0163で削除'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','クラブ','COBRA',null,'会員',0.90,10,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','グリップ',null,null,'会員',0.90,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','グリップ',null,null,'ビジター',1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','練習機',null,null,'会員',0.90,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','練習機',null,null,'ビジター',1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','グローブ',null,null,'会員',0.90,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','グローブ',null,null,'ビジター',1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','工具',null,null,'会員',0.90,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','工具',null,null,'ビジター',1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','ハドラス',null,null,'会員',0.90,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','ハドラス',null,null,'ビジター',1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','ボール',null,null,'会員',1.00,0,'※0163で差し替え'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','ボール',null,null,'ビジター',1.00,0,'※0163で差し替え'),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','スリーブ',null,null,null,1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','ウッド用 ソケット',null,null,null,1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','アイアン用 ソケット',null,null,null,1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','工賃',null,null,null,1.00,0,null),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','*',null,null,null,1.00,-100,'既定。ルールが無い商品は割引しない');
