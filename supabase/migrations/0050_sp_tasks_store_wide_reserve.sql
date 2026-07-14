-- 0050_sp_tasks_store_wide_reserve.sql
-- スタッフポータルの「やること」(sp_tasks) を店舗共通タスクに対応させ、Reserve OS の申込を流し込む。
--
-- 背景（DECISIONS #55）:
--   予約OSの申込は「GOLF WINGの誰かが日程を確認して折り返す」性質の仕事で、特定個人の宿題ではない。
--   そこで sp_tasks を「個人あて（staff_id）」と「店舗共通（staff_id is null + store_id）」の2種類に拡張し、
--   申込時に店舗共通タスクを1件作る。誰かが完了にすれば全員のリストから消える。
--   メール/LINE通知は次回（RESERVE_STAFF_EMAIL・notifyLine未設定のため、当面はこのタスクが唯一の導線）。
--
-- 参照連携（ref_type/ref_id）は FK を張らない疎結合（day-feed と同じ思想 / STAFF_PORTAL.md §5）。

-- 1) 店舗共通タスク: staff_id を NULL 許容にする
alter table sp_tasks alter column staff_id drop not null;

-- 個人あて or 店舗共通のどちらかであること（両方nullは不可＝宛先不明タスクを作らせない）
alter table sp_tasks add constraint sp_tasks_target_check
  check (staff_id is not null or store_id is not null);

-- 2) 発信元に 'reserve'（予約OS）を追加
alter table sp_tasks drop constraint sp_tasks_source_check;
alter table sp_tasks add constraint sp_tasks_source_check
  check (source = any (array['manual','manager','genesis','ai','reserve']));

-- 3) 参照元レコードへの疎結合リンク（予約申込 → 詳細画面へ飛ぶため）
alter table sp_tasks add column if not exists ref_type text
  check (ref_type is null or ref_type in ('reserve_request'));
alter table sp_tasks add column if not exists ref_id uuid;

-- 4) 共通タスクは「誰が完了したか」が分からないと運用できないので記録する
alter table sp_tasks add column if not exists done_by uuid references staff(id);
alter table sp_tasks add column if not exists done_at timestamptz;

-- 5) インデックス: 店舗共通タスクの日別取得（home/calendar が毎回引く）
create index if not exists idx_sp_tasks_store_date
  on sp_tasks (company_id, store_id, date) where deleted_at is null and staff_id is null;

-- 同じ申込から重複してタスクを作らない（再送・リトライ対策）
create unique index if not exists idx_sp_tasks_ref
  on sp_tasks (ref_type, ref_id) where deleted_at is null and ref_id is not null;
