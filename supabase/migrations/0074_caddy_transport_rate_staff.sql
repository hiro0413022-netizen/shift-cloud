-- 0074_caddy_transport_rate_staff.sql
-- 交通費 単価表を「社員（staff）」にも対応（#62 林さん対応の続き）
--
-- 背景: 林さんは社員としてキャディに入る。交通費はゴルフ場ごとに決まるため、
-- 委託先と同じように「社員 × ゴルフ場」でも交通費単価を設定できるようにする。
-- （精算は給与側。ここは派遣入力時の自動反映のための単価表）
--
-- 追加のみ（DECISIONS #2）。partner_id / staff_id はどちらか一方（排他）。

alter table cad_transport_rates alter column partner_id drop not null;
alter table cad_transport_rates add column if not exists staff_id uuid references staff(id);

-- どちらか一方だけを持つ（排他）
alter table cad_transport_rates drop constraint if exists cad_transport_rates_ref_check;
alter table cad_transport_rates add constraint cad_transport_rates_ref_check
  check ((partner_id is not null) <> (staff_id is not null));

-- 旧: unique(company_id, client_id, partner_id) を partial unique に置き換え
alter table cad_transport_rates drop constraint if exists cad_transport_rates_company_id_client_id_partner_id_key;
create unique index if not exists uq_cad_transport_rates_partner
  on cad_transport_rates (company_id, client_id, partner_id) where partner_id is not null;
create unique index if not exists uq_cad_transport_rates_staff
  on cad_transport_rates (company_id, client_id, staff_id) where staff_id is not null;

comment on column cad_transport_rates.staff_id is '社員がキャディに入る場合の交通費単価（partner_idと排他）';
