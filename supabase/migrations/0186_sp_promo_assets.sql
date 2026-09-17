-- 0186_sp_promo_assets.sql  (#251 広報素材の共有：ロゴ・写真・30秒までの動画)
--
-- 2026-09-17 ユーザー要望「広報用のロゴや写真をシフトOSの画面から共有できるように（動画は30秒まで）」。
-- ・スタッフ全員が 見る／ダウンロード／スマホの共有（LINE・Instagram等）／追加 ができる（ユーザー決定）
-- ・消せるのは 追加した本人 と お知らせ管理（manage_announcements）の人
-- ・実体は private バケット promo-assets。表示・ダウンロードは署名URL（Shift Cloud サーバーが発行）
-- ・読み書きは service_role（createAdmin）だけ＝RLS ON・ポリシー無し（本リポジトリの標準形・DECISIONS #3）

create table if not exists public.sp_promo_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  kind text not null check (kind in ('logo', 'photo', 'video')),
  title text not null,
  note text,
  file_path text not null,
  file_name text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width int,
  height int,
  duration_sec numeric(5, 1),
  uploaded_by uuid references public.staff(id),
  uploaded_by_name text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 動画は30秒まで（端末ごとの丸めを見込んで30.5秒までは通す）
  constraint sp_promo_assets_video_len check (kind <> 'video' or (duration_sec is not null and duration_sec <= 30.5))
);

create index if not exists idx_sp_promo_assets_company
  on public.sp_promo_assets (company_id, kind, created_at desc) where deleted_at is null;

comment on table public.sp_promo_assets is
  '広報素材（ロゴ・写真・30秒までの動画）。実体は storage promo-assets。Shift Cloud /promo から共有（#251）';

alter table public.sp_promo_assets enable row level security;
revoke all on public.sp_promo_assets from anon, authenticated;
grant select, insert, update, delete on public.sp_promo_assets to service_role;

-- 実体の置き場（非公開）。50MB まで・画像と動画だけ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promo-assets', 'promo-assets', false, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif',
        'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;
