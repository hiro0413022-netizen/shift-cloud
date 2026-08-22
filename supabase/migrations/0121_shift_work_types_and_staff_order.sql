-- 0121_shift_work_types_and_staff_order.sql
-- シフト作成で「業務」（キャディ等）を選べるようにする＋スタッフの並び順（DECISIONS #147）
--
-- 背景:
--   schedule_types（現場/レッスン/会議/…）は 0001 からある業務区分マスタで13件入っているのに、
--   shifts.schedule_type_id は一度も使われていなかった（列だけ存在・アプリから参照ゼロ）。
--   小川さん依頼「シフト作成時にキャディー業務の選択ができるように。表示するかどうかは人ごとに」
--   → 既存の schedule_types をそのまま選択肢にし、**誰に出すか**を staff_schedule_types で持つ。
--   紙シフトの並び順は staff.sort_order で決める（一覧の▲▼で入れ替える）。
--
-- ⚠ 適用済み（2026-08-22・Supabase MCPで実行）。

-- ============================================================
-- 1. スタッフの並び順（紙シフト出力・シフト作成の行順）
-- ============================================================
alter table staff add column if not exists sort_order integer not null default 0;
comment on column staff.sort_order is
  '小さいほど上。紙シフト出力とシフト作成の行順に使う（同値なら氏名順）。0=未設定';

create index if not exists staff_sort_idx on staff (company_id, sort_order);

-- ============================================================
-- 2. 「この人のシフトに出す業務」= staff × schedule_types
--    行が無い＝その人には業務の選択肢を出さない（既定は今までどおり素のシフト）
-- ============================================================
create table if not exists staff_schedule_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  schedule_type_id uuid not null references schedule_types(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (staff_id, schedule_type_id)
);

comment on table staff_schedule_types is
  'シフト作成の「業務」プルダウンに、その人に出す種別だけを並べるための対応表（#147）';

create index if not exists staff_schedule_types_staff_idx
  on staff_schedule_types (staff_id) where deleted_at is null;

-- 本リポジトリの標準: RLS有効＋ポリシー0＝service_roleのみ（#64/#65）
alter table staff_schedule_types enable row level security;

-- ============================================================
-- 3. キャディ（cad_partners）とスタッフの紐付け
--    Caddy OS で確定した派遣を、その人のシフトに自動表示するために要る。
--    氏名の一致だけで結ぶと事故るので **列で明示的に持つ**（Caddy OSの設定画面から直せる）。
-- ============================================================
alter table cad_partners add column if not exists staff_id uuid references staff(id);
comment on column cad_partners.staff_id is
  '同一人物のスタッフ行。確定した派遣をShift Cloudのシフトへ自動表示するのに使う（#147）';

create index if not exists cad_partners_staff_idx on cad_partners (staff_id) where staff_id is not null;

-- ============================================================
-- 4. 業務区分「キャディ」を追加（既にあれば何もしない）
-- ============================================================
insert into schedule_types (company_id, name, category, color, sort_order)
select c.id, 'キャディ', 'work', '#b45309', 0
from companies c
where c.deleted_at is null
  and not exists (
    select 1 from schedule_types st
    where st.company_id = c.id and st.name = 'キャディ' and st.deleted_at is null
  );

-- ============================================================
-- 5. バックフィル: 氏名（空白を除いて比較）が **両側で一意に一致** するときだけ結ぶ。
--    一致しない・複数一致は結ばない（あとから画面で指定する）。
--    2026-08-22の実行結果: 古川博庸 / 小川うらら / 穴田賢太 / 卜部凡夫 の4名。
-- ============================================================
with s as (
  select id, company_id, replace(replace(name, ' ', ''), '　', '') as key
  from staff where deleted_at is null and status = 'active'
),
p as (
  select id, company_id, replace(replace(name, ' ', ''), '　', '') as key
  from cad_partners where deleted_at is null
),
uniq_s as (select company_id, key, (array_agg(id))[1] as staff_id, count(*) n from s group by 1,2),
uniq_p as (select company_id, key, (array_agg(id))[1] as partner_id, count(*) n from p group by 1,2)
update cad_partners cp
   set staff_id = uniq_s.staff_id, updated_at = now()
  from uniq_s join uniq_p on uniq_p.company_id = uniq_s.company_id and uniq_p.key = uniq_s.key
 where cp.id = uniq_p.partner_id
   and cp.staff_id is null
   and uniq_s.n = 1 and uniq_p.n = 1;

-- ============================================================
-- 6. 結んだ人には「キャディ」を既定で表示にしておく（あとから外せる）
-- ============================================================
insert into staff_schedule_types (company_id, staff_id, schedule_type_id)
select distinct cp.company_id, cp.staff_id, st.id
from cad_partners cp
join schedule_types st
  on st.company_id = cp.company_id and st.name = 'キャディ' and st.deleted_at is null
where cp.staff_id is not null
  and cp.deleted_at is null
  and cp.status = 'active'
on conflict (staff_id, schedule_type_id) do nothing;
