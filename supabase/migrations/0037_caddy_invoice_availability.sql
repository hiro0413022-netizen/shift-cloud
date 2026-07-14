-- 0037_caddy_invoice_availability.sql
-- Caddy OS フェーズ2: 請求書 + 出勤可否シフト（DECISIONS #46）
--
-- 1) 請求書（cad_invoices）
--    実物（2026年6月 加古川ゴルフ倶楽部）を解析して仕様を確定:
--      - 明細は「キャディ業務料（YYYY年M月D日 分）」× 数量（その日の人工数）× 単価
--      - 小計 → 税率10% → 税額 → 合計（外税）
--      - 締切日は取引先の締め日（月末 / 20日）に従う
--    発行時点の明細を snapshot（jsonb）で保存する。後から派遣を直しても
--    発行済み請求書の金額は動かない（会計の原則）。
--
-- 2) 出勤可否（cad_availability）
--    委託先キャディが「その日 出られるか」だけを持つ最小構成。
--    ※ 委託先は社員ではないため Shift Cloud の staff/勤怠/給与には載せない
--      （載せると人件費の二重計上になる。0036 の設計思想と同じ）
--
-- 追加のみ（DECISIONS #2）。RLS標準（#3）: 読みは認証ユーザ、書きは service_role。

create table if not exists cad_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  client_id uuid not null references cad_clients(id),
  invoice_no text not null,                 -- 例: 2026-06-G0002
  target_month date not null,               -- 請求対象月（月初日）
  closing_date date not null,               -- 締切日（取引先の締め日）
  issue_date date not null,                 -- 発行日
  subtotal integer not null check (subtotal >= 0),
  tax_rate numeric(4,3) not null default 0.10,
  tax integer not null check (tax >= 0),
  total integer not null check (total >= 0),
  lines jsonb not null default '[]'::jsonb, -- [{date, label, qty, unit_price, amount}]
  status text not null default 'issued' check (status in ('issued', 'sent', 'paid', 'void')),
  paid_at date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, invoice_no)
);
create index if not exists idx_cad_invoices_client on cad_invoices (client_id, target_month) where deleted_at is null;

create table if not exists cad_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  partner_id uuid not null references cad_partners(id),
  date date not null,
  status text not null check (status in ('available', 'unavailable', 'maybe')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (partner_id, date)
);
create index if not exists idx_cad_availability_date on cad_availability (company_id, date) where deleted_at is null;

alter table cad_invoices enable row level security;
alter table cad_availability enable row level security;

drop policy if exists cad_invoices_read on cad_invoices;
create policy cad_invoices_read on cad_invoices for select to authenticated using (true);
drop policy if exists cad_availability_read on cad_availability;
create policy cad_availability_read on cad_availability for select to authenticated using (true);

drop trigger if exists trg_cad_invoices_updated on cad_invoices;
create trigger trg_cad_invoices_updated before update on cad_invoices for each row execute function app.set_updated_at();
drop trigger if exists trg_cad_availability_updated on cad_availability;
create trigger trg_cad_availability_updated before update on cad_availability for each row execute function app.set_updated_at();

-- 会社情報（請求書の差出人）。既存の companies.settings に入れる（テーブル追加を避ける）
update companies
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'invoice', jsonb_build_object(
    'company_name', '株式会社YOZAN',
    'representative', '代表取締役 古川博庸',
    'postal_code', '〒665-0816',
    'address', '兵庫県宝塚市平井6-2-21-404',
    'bank_name', '尼崎信用金庫 鴻池支店',
    'bank_account', '普通預金 4120589',
    'bank_holder', 'ｶ.ﾖｳｻﾞﾝ',
    'tax_rate', 0.10,
    'item_label', 'キャディ業務料'
  )
)
where id = 'ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and not (coalesce(settings, '{}'::jsonb) ? 'invoice');
