-- 0123: FRANK 会員ポータル / QRチェックイン / モバイルオーダー（DECISIONS #154）
--
-- 設計の正典: docs/modules/frank/MEMBER_PORTAL_構想.md
--   親＝会員ポータル（my.frankgolf.jp）、子＝QRチェックインとモバイルオーダー。
--   狙いは「来店したらスマホを開く」習慣化で、チェックインはその入口。
--
-- 後方互換: 追加のみ（既存列の変更・削除なし）。RELEASE_PROCESS.md §4。

-- ---------------------------------------------------------------
-- 1. 会員証トークン（チェックイン専用）
-- ---------------------------------------------------------------
-- なぜハッシュではなく生の値を持つか:
--   このトークンは会員のスマホに毎回QRとして「描画」する必要があるため、
--   サーバー側が原文を再現できないと表示できない（res_member_sessions のような
--   使い捨てトークンとは性質が違う）。
-- そのかわり権限を最小にしてある:
--   - できるのは「チェックイン」だけ。注文・決済・個人情報の閲覧は一切できない
--     （注文は会員ポータルのログインセッション mos_member でのみ可能）
--   - 漏れたら /member の設定から再発行できる（この列を作り直すだけ）
-- 文字種は 数字＋英大文字のみ（0/O・1/I は除外）。
--   受付のバーコードリーダー(Tera 9200)は既定でUS配列のキーボードとして送るため、
--   記号や小文字を混ぜると日本語配列のPCで化ける。
alter table public.frunk_members
  add column if not exists checkin_token text,
  add column if not exists checkin_token_issued_at timestamptz;

create unique index if not exists uq_frunk_members_checkin_token
  on public.frunk_members (checkin_token) where checkin_token is not null;

comment on column public.frunk_members.checkin_token is
  '会員証QRの中身。数字＋英大文字16桁。会員番号(FR0001=連番)を使うと他人がQRを自作できるため別の推測不能IDにしている。権限はチェックインのみ';
comment on column public.frunk_members.checkin_token_issued_at is
  'トークンの発行日時。再発行するとこの値が更新される';

-- ---------------------------------------------------------------
-- 2. チェックイン台帳
-- ---------------------------------------------------------------
create table if not exists public.frunk_checkins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid not null,
  member_id uuid references public.frunk_members(id),
  booking_id uuid references public.frunk_bookings(id),
  bay_id uuid references public.frunk_bays(id),
  visited_on date not null,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  source text not null default 'qr' check (source in ('qr','manual','bay')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.frunk_checkins enable row level security;

-- 同じ会員が同じ日に何度かざしても1行（2回目以降は打席の更新だけ）。
-- 「来店回数」を数える台帳なので、ここが増えると声かけカードと来店KPIが狂う。
create unique index if not exists uq_frunk_checkin_member_day
  on public.frunk_checkins (member_id, visited_on)
  where deleted_at is null and member_id is not null;

create index if not exists idx_frunk_checkins_day
  on public.frunk_checkins (company_id, visited_on) where deleted_at is null;

comment on table public.frunk_checkins is
  'FRANK 来店チェックイン台帳。1会員1日1行。frunk_bookings.status=visited の更新と対で動く（#154）';
comment on column public.frunk_checkins.source is
  'qr=会員証QR / manual=受付で氏名検索して手動 / bay=打席QRから（未チェックインだった場合）';

-- ---------------------------------------------------------------
-- 3. メニュー（モバイルオーダー）
-- ---------------------------------------------------------------
-- Squareカタログには item/variation の ID がDBに保存されていない（frank-square-setup.mjs は
-- 商品名の一致でしか冪等性を見ていない）。ポータル側は自前のメニュー表を正とし、
-- 決済は金額指定の Payments API で行う。品目の内訳は frunk_order_items が正典。
create table if not exists public.frunk_menu_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  category text not null,
  name text not null,
  price_general integer not null,
  price_member integer not null,
  sort integer not null default 0,
  sold_out boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.frunk_menu_items enable row level security;

create unique index if not exists uq_frunk_menu_items_name
  on public.frunk_menu_items (company_id, name) where deleted_at is null;

comment on table public.frunk_menu_items is
  'モバイルオーダーのメニュー。価格は税込。Squareカタログ(scripts/frank-square-setup.mjs)と同じ品目・同じ価格を保つこと';

-- ---------------------------------------------------------------
-- 4. 注文（電子伝票）
-- ---------------------------------------------------------------
create table if not exists public.frunk_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_id uuid not null,
  order_no text not null,
  bay_id uuid references public.frunk_bays(id),
  member_id uuid references public.frunk_members(id),
  checkin_id uuid references public.frunk_checkins(id),
  guest_label text,
  ordered_on date not null,
  status text not null default 'open' check (status in ('open','served','cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','paid','failed','refunded')),
  amount integer not null default 0,
  square_payment_id text,
  payment_error text,
  source text not null default 'portal' check (source in ('portal','bay','staff')),
  ordered_at timestamptz not null default now(),
  served_at timestamptz,
  served_by uuid references public.staff(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.frunk_orders enable row level security;

create unique index if not exists uq_frunk_orders_no
  on public.frunk_orders (company_id, order_no) where deleted_at is null;
create unique index if not exists uq_frunk_orders_square_payment
  on public.frunk_orders (square_payment_id) where square_payment_id is not null;
create index if not exists idx_frunk_orders_day
  on public.frunk_orders (company_id, ordered_on) where deleted_at is null;

comment on table public.frunk_orders is
  'モバイルオーダー＋口頭注文の電子伝票。1注文=1行。会計はSquare（会員=保存カードに即時課金 / ビジター=退店時にレジ）';
comment on column public.frunk_orders.member_id is
  'null＝ビジター（打席QRから未ログインで注文）。あとから会員に紐付け直せる（伝票の「会員に紐付ける」）';
comment on column public.frunk_orders.payment_status is
  'paid=保存カードに課金済 / unpaid=退店時会計 / failed=カードが通らず未収のまま伝票に出す（注文自体は止めない）';
comment on column public.frunk_orders.source is
  'portal=会員ポータルから / bay=打席QRから / staff=スタッフが口頭注文を伝票に追加';

create table if not exists public.frunk_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.frunk_orders(id) on delete cascade,
  menu_item_id uuid references public.frunk_menu_items(id),
  name text not null,
  price_kind text not null default 'member' check (price_kind in ('general','member')),
  unit_price integer not null,
  qty integer not null check (qty > 0),
  amount integer not null,
  created_at timestamptz not null default now()
);
alter table public.frunk_order_items enable row level security;

create index if not exists idx_frunk_order_items_order
  on public.frunk_order_items (order_id);

comment on table public.frunk_order_items is
  '注文の明細。name/unit_price は注文時点の値をコピーして保持する（メニュー改定で過去の伝票が変わらないように）';

-- ---------------------------------------------------------------
-- 5. 更新時刻トリガ（既存 app.set_updated_at を再利用）
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['frunk_checkins','frunk_menu_items','frunk_orders'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'app' and p.proname = 'set_updated_at') then
      execute format('drop trigger if exists set_updated_at on public.%I', t);
      execute format('create trigger set_updated_at before update on public.%I
                        for each row execute function app.set_updated_at()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 6. メニューの投入（Squareカタログ scripts/frank-square-setup.mjs と同一・税込）
-- ---------------------------------------------------------------
insert into public.frunk_menu_items (company_id, category, name, price_general, price_member, sort)
values
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','コーヒー',400,300,10),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','アイスコーヒー',400,300,20),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','カフェラテ',500,400,30),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','アイスカフェラテ',500,400,40),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','紅茶',400,300,50),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','アイスティー',400,300,60),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','コカ・コーラ',400,300,70),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','ジンジャーエール',400,300,80),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','オレンジジュース',400,300,90),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','アップルジュース',400,300,100),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','ウーロン茶',400,300,110),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','炭酸水',350,250,120),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','ポカリスエット',400,300,130),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','オロナミンC',400,300,140),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','レッドブル',500,450,150),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','DRINK','プロテインドリンク',500,400,160),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','FRANK SPECIAL','FRANK レモンスカッシュ',500,400,210),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','FRANK SPECIAL','ゆずソーダ',500,400,220),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','FRANK SPECIAL','マンゴーソーダ',500,400,230),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','FRANK SPECIAL','ピーチソーダ',500,400,240),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','FRANK SPECIAL','ノンアルモヒート',550,450,250),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','NON-ALCOHOL','ノンアルコールビール',500,400,310),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','NON-ALCOHOL','ノンアルレモンサワー',500,400,320),
  ('ec00ad2a-4032-4061-bdb7-03face8a04e7','NON-ALCOHOL','ノンアルハイボール',500,400,330)
on conflict do nothing;
