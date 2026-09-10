-- 0153_night_os_item_rule_ref.sql — 明細がどの設定行から作られたかを残す（Night OS / 2026-09-09）
-- ドリンクは種類ごとにバックが違う（ハウス¥750 / カクテル¥1,000…）。
-- 「どの種類だったか」を残しておかないと、あとで日当を計算し直せない。
alter table nite_slip_items add column if not exists rule_ref text;
comment on column nite_slip_items.rule_ref is
  'この明細の元になった設定のID（例 drink:house / bottle:t2）。日当の再計算と説明に使う';
