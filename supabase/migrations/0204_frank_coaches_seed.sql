-- 0204: コーチ紹介に「リンク」を足して、公式サイトの中身をそのまま移す（#279・2026-09-25）
--
-- 0203 で入れた仮の文章のままだと、公式サイトの紹介文が今より痩せてしまう。
-- いま frankgolf.jp に出ている文章・資格・YouTubeボタンを、そのままこの行に移す。
-- これ以降は「HTMLを直す」のではなく「管理画面で直す」が正典になる。

alter table public.frunk_coaches add column if not exists link_url text;
alter table public.frunk_coaches add column if not exists link_label text;

comment on column public.frunk_coaches.link_url is
  'コーチごとの外部リンク（YouTubeなど）。空なら button は出ない';

update public.frunk_coaches set
  name       = '小川 うらら',
  name_en    = 'Urara OGAWA',
  title      = 'HEAD COACH',
  photo_url  = 'https://frankgolf.jp/assets/img/coach-rara.jpg',
  bio        = E'FRANK GOLFのメインコーチ。チャンネル登録者数約6万人のレッスン系YouTuber「RaRa LESSON」として活動し、ジュニア時代は全国大会に出場するなど競技経験も豊富です。\n「何を直せばいいか分からない」から卒業。一人ひとりに寄り添って、もっとゴルフが楽しくなるレッスンをお届けします。',
  quals      = E'USGTF（全米ゴルフ指導者連盟）レベルⅢ 認定\nYouTube「RaRa LESSON」チャンネル登録者6万人超\nジュニア時代は全国大会に出場\nFRANK GOLF 姫路 メインコーチ',
  link_url   = 'https://www.youtube.com/channel/UC4QTQjrDLsx4WF3fdYuLHZQ',
  link_label = '無料レッスン動画を見る（YouTube）',
  updated_at = now()
where name in ('小川 うらら', '小川うらら') and deleted_at is null;
