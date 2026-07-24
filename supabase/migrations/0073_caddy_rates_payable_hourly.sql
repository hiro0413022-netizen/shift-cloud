-- 0073_caddy_rates_payable_hourly.sql
-- Caddy OS フェーズ3（DECISIONS #62）
--
-- 追加する4つの機能:
--   ① キャディ → YOZAN の請求書（支払）… cad_invoices を受取/支払の両対応にする
--   ② 交通費を「キャディ × ゴルフ場」で設定 …… cad_transport_rates（新設）
--   ③ 委託料を「ゴルフ場ごと（全キャディ共通）」で設定 … cad_clients.partner_fee
--   ④ 台帳に出すキャディを絞り込む …………………… cad_partners.show_in_picker
--   ⑤ ゴルフウィング勤務の時給 ……………………… cad_partners.hourly_wage
--       + cad_dispatches.kind に 'golfwing' を追加（work_hours を持つ）
--       ゴルフウィング勤務は partner_id を持つ行として登録し、fee_amount に
--       「時間 × 時給」を入れる。これで既存の refresh_caddy_finance が
--       キャディ事業の外注費として自動集計する（ユーザー決定 2026-07-24）。
--       ゴルフウィングへの請求書は作らない。キャディ→YOZAN 請求書に合算される。
--
-- 追加のみ（DECISIONS #2）。RLS標準（#3）: 読みは認証ユーザ、書きは service_role。

-- ── ③ 委託料（ゴルフ場ごと・全キャディ共通）。派遣ごとの上書きは従来どおり可 ──
alter table cad_clients add column if not exists partner_fee integer;  -- 標準の委託料（円/人工）
-- 請求書画面（invoices/[clientId]）が参照しているが 0036 で未定義だった列を補う
alter table cad_clients add column if not exists postal_code text;

-- ── ④⑤ 委託先マスタ: 台帳表示フラグ・ゴルフウィング時給 ──
alter table cad_partners add column if not exists show_in_picker boolean not null default true;
alter table cad_partners add column if not exists hourly_wage integer;  -- ゴルフウィング勤務の時給（円/時）

-- ── ② 交通費（キャディ × ゴルフ場）──
create table if not exists cad_transport_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  client_id uuid not null references cad_clients(id),
  partner_id uuid not null references cad_partners(id),
  amount integer not null default 0 check (amount >= 0),  -- 交通費（円/回）
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, client_id, partner_id)
);
create index if not exists idx_cad_transport_rates_lookup
  on cad_transport_rates (client_id, partner_id) where deleted_at is null;

alter table cad_transport_rates enable row level security;
drop policy if exists cad_transport_rates_read on cad_transport_rates;
create policy cad_transport_rates_read on cad_transport_rates for select to authenticated using (true);
drop trigger if exists trg_cad_transport_rates_updated on cad_transport_rates;
create trigger trg_cad_transport_rates_updated before update on cad_transport_rates
  for each row execute function app.set_updated_at();

-- ── ⑤ ゴルフウィング勤務: kind に 'golfwing' を追加 + 時間数 ──
alter table cad_dispatches drop constraint if exists cad_dispatches_kind_check;
alter table cad_dispatches add constraint cad_dispatches_kind_check
  check (kind in ('dispatch', 'training', 'other', 'golfwing'));
alter table cad_dispatches add column if not exists work_hours numeric(5,2);  -- golfwing のみ使用

-- ── ① 請求書を「受取（取引先）/ 支払（委託先）」の両対応に ──
-- 受取: client_id（取引先へ請求）／支払: partner_id（委託先が YOZAN へ請求）
alter table cad_invoices add column if not exists kind text not null default 'receivable'
  check (kind in ('receivable', 'payable'));
alter table cad_invoices add column if not exists partner_id uuid references cad_partners(id);
-- 支払請求書は client_id を持たないため NOT NULL を外す
alter table cad_invoices alter column client_id drop not null;
-- 受取は client_id 必須 / 支払は partner_id 必須（どちらか一方）
alter table cad_invoices drop constraint if exists cad_invoices_target_check;
alter table cad_invoices add constraint cad_invoices_target_check check (
  (kind = 'receivable' and client_id is not null) or
  (kind = 'payable' and partner_id is not null)
);
create index if not exists idx_cad_invoices_partner
  on cad_invoices (partner_id, target_month) where deleted_at is null;

comment on column cad_clients.partner_fee is 'ゴルフ場ごとの標準委託料（全キャディ共通）。派遣ごとに上書き可';
comment on column cad_partners.show_in_picker is '派遣台帳のプルダウンに表示するか（退職・休眠キャディを隠す）';
comment on column cad_partners.hourly_wage is 'ゴルフウィング勤務の時給。キャディ→YOZAN請求書に合算';
comment on table cad_transport_rates is 'キャディ×ゴルフ場ごとの交通費単価表';
