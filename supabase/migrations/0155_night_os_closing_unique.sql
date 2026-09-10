-- 0155_night_os_closing_unique.sql — 締めの一意制約（Night OS / 2026-09-09）
-- 0151で作った uq_nite_closings は部分索引（deleted_at is null）で、
-- PostgREST の upsert(onConflict) は部分索引を推論できず失敗する。
-- 締めは「1店舗×1月に1つ」で論理削除しない運用なので、通常の一意制約にする。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_nite_closings_store_month'
  ) then
    alter table nite_closings add constraint uq_nite_closings_store_month unique (store_id, target_month);
  end if;
end $$;

comment on constraint uq_nite_closings_store_month on nite_closings is
  '1店舗×1月に締めは1つ。アプリ側の upsert(store_id,target_month) はこの制約を使う';
