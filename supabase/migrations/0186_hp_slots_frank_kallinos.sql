-- 0186: FRANK GOLF・KALLINOS の差し替え枠（#249 の続き）
-- FRANK: キーは img.<site-data.js の images のキー>（assets/hp.js が window.FRANK.images を上書き）
-- KALLINOS: キーは img.<data-hp-img / data-hp-bg の値>（js/hp.js が差し替え）
insert into public.hp_slots(site, key, kind, page_label, label, help, default_value, sort_order) values
  ('frank-golf','img.hero','image','トップページ','いちばん上の店舗外観の写真（施設ページの館内写真にも使われます）',null,'https://frankgolf.jp/assets/img/hero-1.jpg',10),
  ('frank-golf','img.lessonPic','image','トップページ','「レッスン」の写真',null,'https://frankgolf.jp/assets/img/lesson-rara.jpg',20),
  ('frank-golf','img.bay','image','トップページ','「打席」の写真',null,'https://frankgolf.jp/assets/img/play.jpg',30),
  ('frank-golf','img.sim','image','トップページ','「シミュレーター」の写真（トップ内2か所）',null,'https://frankgolf.jp/assets/img/hero-2.jpg',40),
  ('frank-golf','img.lounge','image','トップページ','「バーラウンジ」の写真（施設・ラウンジページにも使われます）',null,'https://frankgolf.jp/assets/img/lounge.jpg',50),
  ('frank-golf','img.lesson','image','施設・レッスン','レッスンページの写真（施設ページにも使われます）',null,'https://frankgolf.jp/assets/img/lesson-rara-wide.jpg',60),
  ('frank-golf','img.play','image','施設・レッスン','施設ページの打席の写真（2か所）',null,'https://frankgolf.jp/assets/img/play.jpg',70),
  ('frank-golf','img.concept','image','コンセプト・コミュニティ','コンセプトページの写真（施設ページにも使われます）',null,'https://frankgolf.jp/assets/img/play.jpg',80),
  ('frank-golf','img.community','image','コンセプト・コミュニティ','コミュニティページの写真（施設ページにも使われます）',null,'https://frankgolf.jp/assets/img/community.jpg',90),
  ('kallinos','site.instagram_url','text','サイト全体','InstagramアカウントのURL','トップの「Follow on Instagram」ボタンの行き先になります','https://instagram.com/kallinos_official',10),
  ('kallinos','img.index.hero','image','トップページ','いちばん上の大きな背景写真',null,'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=1600&q=80',20),
  ('kallinos','img.index.brand','image','トップページ','「静かに伝わる、上質な一着。」の横の写真',null,'https://images.unsplash.com/photo-1594938298603-c8148c4b4e48?w=900&q=80',30),
  ('kallinos','img.index.concept','image','トップページ','英語の一文（Style is not about…）の背景写真',null,'https://images.unsplash.com/photo-1592919505780-303950717480?w=1600&q=80',40),
  ('kallinos','img.index.look1','image','トップページ','「着用イメージ」1枚目（大）',null,'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=900&q=80',50),
  ('kallinos','img.index.look2','image','トップページ','「着用イメージ」2枚目',null,'https://images.unsplash.com/photo-1593079831268-3381b0db4a77?w=800&q=80',60),
  ('kallinos','img.index.look3','image','トップページ','「着用イメージ」3枚目',null,'https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=800&q=80',70),
  ('kallinos','img.brand.hero','image','ブランドストーリー','いちばん上の背景写真（少し暗く表示されます）',null,'https://images.unsplash.com/photo-1592919505780-303950717480?w=1600&q=80',80),
  ('kallinos','img.brand.photo1','image','ブランドストーリー','「KALLINOS の始まり」の横の写真',null,'https://images.unsplash.com/photo-1594938298603-c8148c4b4e48?w=900&q=80',90),
  ('kallinos','img.brand.photo2','image','ブランドストーリー','「コースでも、街でも。」の横の写真',null,'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=900&q=80',100),
  ('kallinos','img.brand.craft1','image','ブランドストーリー','こだわり①「素材」',null,'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&q=80',110),
  ('kallinos','img.brand.craft2','image','ブランドストーリー','こだわり②「縫製」',null,'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80',120),
  ('kallinos','img.brand.craft3','image','ブランドストーリー','こだわり③「品質管理」',null,'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=800&q=80',130),
  ('kallinos','img.brand.craft4','image','ブランドストーリー','こだわり④「パッケージング」',null,'https://images.unsplash.com/photo-1536304993881-ff86e6c73d33?w=800&q=80',140)
on conflict (site, key) do update set kind = excluded.kind, page_label = excluded.page_label, label = excluded.label,
  help = excluded.help, default_value = excluded.default_value, sort_order = excluded.sort_order;
