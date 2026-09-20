-- 0195 キャディの担当ゴルフ場 ＋ 出勤希望に「どのゴルフ場で出られるか」（2026-09-20）
--
-- ユーザー依頼: シフト提出時に、その日どのゴルフ場で出勤できるかを複数選べるようにする。
-- 選択肢はキャディごとに登録した担当ゴルフ場だけ（管理画面 /masters で編集）。
--
-- 設計:
--  - 担当ゴルフ場は cad_partner_clients（キャディ×ゴルフ場の組）。主キーで二重登録を防ぐ。
--  - 日ごとの選択は cad_availability.client_ids（uuid[]）。出勤希望は今も 1日×1人＝1行
--    （unique(partner_id,date)）のままなので、カレンダーに同じ人が二重に出ることは構造的に無い。
--    空配列＝ゴルフ場の指定なし（既存データ・担当が未登録の人）。
--  - 既存の cad_partners.main_course（自由記述）から担当を初期投入する。俱/倶の表記ゆれを吸収。

create table if not exists public.cad_partner_clients (
  partner_id uuid not null references public.cad_partners(id) on delete cascade,
  client_id  uuid not null references public.cad_clients(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  created_at timestamptz not null default now(),
  primary key (partner_id, client_id)
);
create index if not exists idx_cad_partner_clients_company on public.cad_partner_clients (company_id);

-- 他の cad_* と同じ: RLS有効・ポリシー無し＝サーバー（service_role）だけが触る
alter table public.cad_partner_clients enable row level security;
revoke all on public.cad_partner_clients from anon;
grant select, insert, update, delete on public.cad_partner_clients to service_role;

alter table public.cad_availability
  add column if not exists client_ids uuid[] not null default '{}';

comment on table public.cad_partner_clients is 'キャディの担当ゴルフ場（シフト提出で選べるゴルフ場）';
comment on column public.cad_availability.client_ids is 'その日に出勤できるゴルフ場（cad_clients.id）。空＝指定なし';

-- 初期投入: main_course とゴルフ場名が（表記ゆれを除いて）一致するもの
insert into public.cad_partner_clients (partner_id, client_id, company_id)
select p.id, c.id, p.company_id
from public.cad_partners p
join public.cad_clients c
  on c.company_id = p.company_id
 and c.deleted_at is null
 and replace(c.name, '俱', '倶') like '%' || replace(btrim(p.main_course), '俱', '倶') || '%'
where p.deleted_at is null
  and coalesce(btrim(p.main_course), '') <> ''
on conflict do nothing;
