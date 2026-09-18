-- 0193: craft-os（工房）から店舗の「やること」（sp_tasks）へ予定を足せるようにする
-- ユーザー要望（2026-09-19）: 注文書を出したら、発注→入荷（平日発送・翌日夕方着・火曜定休なら水曜）→組立→お渡し連絡を
--   【やることリストに追加】ボタンで入れられるように（自動では入れない）。
-- ・source に 'craft' を追加（Shift Cloud の表示ラベルは「工房」）
-- ・ref_key（text）: 同じ注文書の同じ作業を二重に入れないための鍵。例 'craft:wo:12:arrive'
--   ref_id は uuid で、注文書の id（bigint）を入れられないため別の列にした

alter table public.sp_tasks drop constraint if exists sp_tasks_source_check;
alter table public.sp_tasks add constraint sp_tasks_source_check
  check (source = any (array['manual','manager','genesis','ai','reserve','craft']));

alter table public.sp_tasks add column if not exists ref_key text;

create unique index if not exists sp_tasks_ref_key_uniq
  on public.sp_tasks (company_id, ref_key)
  where ref_key is not null and deleted_at is null;
