-- 0020_reservations.sql
-- 予約システム（member-os / 姫路 FRUNK GOLF）— DECISIONS #24, #28。Phase F。
-- 宝塚=Smart Hello継続・一時利用台帳。姫路=本予約システム（枠管理＋スタッフ予約＋お客様Web予約）。
-- store単位でモード運用。会員(member_no)/都度(dropin)対応・課金(amount)対応。既存標準準拠(#11/#17)。

-- 1. 姫路 FRUNK GOLF 店舗を追加（brandは既存GOLF WING配下、営業時間10:00-22:00）
-- 2. 予約リソース（打席/レッスン枠）・予約・公開予約トークン

create table res_resources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  name text not null,
  kind text not null default 'bay' check (kind in ('bay', 'lesson')),
  capacity integer not null default 1,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_res_resources_store on res_resources (company_id, store_id) where deleted_at is null;

create table res_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  resource_id uuid not null references res_resources(id),
  booking_seq bigint generated always as identity,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  customer_kind text not null default 'dropin' check (customer_kind in ('member', 'dropin')),
  member_no text,
  guest_name text,
  guest_phone text,
  guest_email text,
  party_size integer not null default 1,
  status text not null default 'reserved' check (status in ('reserved', 'visited', 'canceled', 'no_show')),
  amount integer,
  note text,
  source text not null default 'staff' check (source in ('web', 'staff')),
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_res_bookings_date on res_bookings (company_id, store_id, booking_date) where deleted_at is null;
-- ダブルブッキング防止（同一リソース・同日・同開始時刻、キャンセル/削除を除く）
create unique index idx_res_bookings_slot on res_bookings (resource_id, booking_date, start_time)
  where deleted_at is null and status <> 'canceled';

create table res_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  token_hash text not null,
  label text,
  active boolean not null default true,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
create unique index idx_res_token_hash on res_tokens (token_hash);

-- トリガー + RLS
create trigger set_updated_at before update on res_resources for each row execute function app.set_updated_at();
create trigger set_updated_at before update on res_bookings for each row execute function app.set_updated_at();
do $$
declare t text;
begin
  foreach t in array array['res_resources', 'res_bookings', 'res_tokens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- 姫路店＋初期リソース（打席6・パーソナルレッスン1）をシード
do $$
declare v_store uuid;
begin
  insert into stores (company_id, brand_id, name, code, open_time, close_time, status)
  values ('ec00ad2a-4032-4061-bdb7-03face8a04e7', 'abb7e59a-8acd-4b5c-a74c-15247749d195', 'FRUNK GOLF 姫路', 'frunk_himeji', '10:00', '22:00', 'active')
  returning id into v_store;

  insert into res_resources (company_id, store_id, name, kind, sort_order) values
    ('ec00ad2a-4032-4061-bdb7-03face8a04e7', v_store, '打席1', 'bay', 1),
    ('ec00ad2a-4032-4061-bdb7-03face8a04e7', v_store, '打席2', 'bay', 2),
    ('ec00ad2a-4032-4061-bdb7-03face8a04e7', v_store, '打席3', 'bay', 3),
    ('ec00ad2a-4032-4061-bdb7-03face8a04e7', v_store, '打席4', 'bay', 4),
    ('ec00ad2a-4032-4061-bdb7-03face8a04e7', v_store, '打席5', 'bay', 5),
    ('ec00ad2a-4032-4061-bdb7-03face8a04e7', v_store, '打席6', 'bay', 6),
    ('ec00ad2a-4032-4061-bdb7-03face8a04e7', v_store, 'パーソナルレッスン', 'lesson', 7);
end $$;
