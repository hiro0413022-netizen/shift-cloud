-- #215 (2026-09-04) 当日の連絡事項（シフトボードの連絡共有にあたるもの）
--
-- ユーザー依頼:「当日の連絡事項みたいなメモが欲しい、表やカレンダーにマークが出るような感じで、
--                あとそれを朝のラインに流せるようにしておいてください。
--                シフトボードの連絡事項共有のようなシステムです」
--
-- ★ 1日だけの連絡と、期間の連絡の両方を1つの表で持つ（ユーザー決定「1,2両方」）。
--   date_from = date_to なら「その日だけ」。分ける必要はない——分けると
--   「今日出す連絡」を2か所から集めることになり、必ず片方を出し忘れる。
--
-- ★ store_id が null は全店共通（朝のLINEの sp_tasks と同じ考え方）。
--
-- ★ 既存の announcements（店舗掲示・shift-cloud）とは別に持つ。
--   あちらは会社の掲示板で、これは「その日の現場の申し送り」。
--   混ぜると朝のLINEに古い掲示まで流れる。

create table if not exists public.store_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  store_id uuid references public.stores(id),          -- null = 全店共通
  date_from date not null,
  date_to date not null,
  body text not null,
  level text not null default 'info',                  -- info / warn（重要）
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint store_notices_range check (date_to >= date_from),
  constraint store_notices_level check (level in ('info', 'warn'))
);

comment on table public.store_notices is 'その日の連絡事項（申し送り）。期間指定可・store_id null=全店共通・朝のLINEに載る（#215）';

create index if not exists idx_store_notices_active
  on public.store_notices (company_id, date_from, date_to)
  where deleted_at is null;

alter table public.store_notices enable row level security;
-- サービスロール（各アプリのサーバー側）からのみ読み書きする。ポリシーは置かない。
