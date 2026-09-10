-- 0154_night_os_cast_pin.sql — キャストのログイン用暗証番号（Night OS / 2026-09-09）
-- 給与が見える画面なので「名前を選ぶだけ」では入れない。携帯番号＋4桁の暗証番号にする。
-- 生の暗証番号は持たない（sha256＋店ごとのsalt。忘れたら店長が再発行する運用）。
alter table nite_casts add column if not exists pin_hash text;
alter table nite_casts add column if not exists pin_set_at timestamptz;
comment on column nite_casts.pin_hash is
  'キャスト用スマホの暗証番号のハッシュ。生の番号は保存しない。忘れた場合は店長が再発行';
