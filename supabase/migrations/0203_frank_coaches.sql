-- 0203: コーチ紹介を現場で編集できるようにする（#279・2026-09-25 ユーザー依頼）
--
-- ねらい: コーチの写真・名前・紹介文は、これまで公式サイトの HTML に直書きで、
--   人が入れ替わるたびに開発が必要だった。店舗スタッフが管理画面から直せるようにする。
--   1つのテーブルを、会員ページのトップと公式サイトの両方が読む（2か所で食い違わせない）。
--
-- ⚠ 名前を出さないスタッフ（staff.line_hidden・#243）はここに入れない。
--   コーチ紹介は公開面なので、LINEより強い意味で「出さない」。
--   管理画面の「スタッフから選ぶ」候補からも外してある。

create table if not exists public.frunk_coaches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_id uuid not null,
  /** 表示するお名前（例「小川 うらら」） */
  name text not null,
  /** ローマ字など（公式サイトの飾り。空でよい） */
  name_en text,
  /** 肩書（例「所属レッスンプロ」） */
  title text,
  /** 顔写真の公開URL（Storage の hp-media バケット） */
  photo_url text,
  /** 紹介文。改行はそのまま出す */
  bio text,
  /** 資格・実績。1行1つ */
  quals text,
  /** 並び順（小さいほど上） */
  sort_order integer not null default 100,
  /** 公開するか。false は下書き＝どちらの画面にも出ない */
  published boolean not null default true,
  /** 出勤予定と結びたいとき（任意）。消えても紹介は残るので参照のみ */
  staff_id uuid references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.frunk_coaches enable row level security;
-- ポリシーは置かない＝service_role（アプリのサーバー側）だけが読み書きする。0064 の方針と同じ

create index if not exists idx_frunk_coaches_store
  on public.frunk_coaches (company_id, store_id, sort_order) where deleted_at is null;

comment on table public.frunk_coaches is
  'コーチ紹介（#279）。会員ページのトップと公式サイト frankgolf.jp が同じ行を読む。写真は Storage の hp-media';
comment on column public.frunk_coaches.published is
  'false は下書き。会員ページにも公式サイトにも出ない';

drop trigger if exists set_updated_at on public.frunk_coaches;
create trigger set_updated_at before update on public.frunk_coaches
  for each row execute function app.set_updated_at();

-- 既存のコーチ（公式サイトに直書きされていた1名）を移す。
-- 写真は公式サイトの assets をそのまま指す（差し替えるまでは今と同じ絵が出る）。
insert into public.frunk_coaches (company_id, store_id, name, name_en, title, photo_url, bio, quals, sort_order)
select s.company_id, s.id, '小川 うらら', 'URARA OGAWA', '所属レッスンプロ',
       'https://frankgolf.jp/assets/img/coach-rara.jpg',
       E'クラブを初めて握る方から、スコアを縮めたい方まで。\nTrackMan 4 の数字を見ながら、その日のうちに「何が変わったか」が分かるレッスンをしています。\nまずは体験レッスンでお気軽にどうぞ。',
       E'ゴルフレッスンプロ\nFRANK GOLF 姫路 所属',
       10
from public.stores s
where s.code like 'frunk%' and s.deleted_at is null
  and not exists (select 1 from public.frunk_coaches c where c.store_id = s.id and c.deleted_at is null);
