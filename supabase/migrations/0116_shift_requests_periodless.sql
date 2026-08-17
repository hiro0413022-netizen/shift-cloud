-- 0116 シフト提出から「募集期間」を廃止（DECISIONS #138）
--
-- 【なぜ】
-- これまでスタッフは、管理者が /admin/shifts で「募集を開始」した期間(shift_request_periods)が
-- 無いと1日も提出できなかった。開始ボタンを押し忘れる＝現場が動けない、が実際に起きる。
-- 休み希望は #131(0111) で既に期間から切り離してある。同じ考え方を通常のシフト提出にも広げる。
--
-- 【やること】
--  ① shift_requests.period_id を任意に（新規提出は null。過去の提出は履歴としてそのまま残す）
--  ② 一意キーを (period_id, staff_id, date) → (staff_id, date) へ。
--     期間が無くなるので「1人1日1件」がそのまま制約になる。
--     ※ 既存データに (staff_id, date) の重複が無いことを確認済み（2026-08-17 時点 79件・重複0）
--  ③ 開きっぱなしの募集期間は締める（テーブルとデータは消さない＝過去の提出の紐付けを保つ）

alter table shift_requests alter column period_id drop not null;

alter table shift_requests drop constraint if exists shift_requests_period_id_staff_id_date_key;

-- 論理削除された行も含めて一意。提出し直しは upsert(staff_id,date) で deleted_at を null に戻す
create unique index if not exists shift_requests_staff_id_date_key
  on shift_requests (staff_id, date);

update shift_request_periods
   set status = 'closed', updated_at = now()
 where status = 'open' and deleted_at is null;

comment on column shift_requests.period_id is
  '旧・募集期間(shift_request_periods)。#138で廃止。新規の提出は null。過去分の履歴としてのみ残す';
