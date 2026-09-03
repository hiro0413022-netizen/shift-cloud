-- 0141: パーソナルレッスンのチケット（#199 / 2026-09-03）
--
-- きっかけ: ユーザー指示「9月入会でパーソナルチケット25分2枚プレゼント。9月入会の方に付与しておいて。
--           会員ページからもレッスンチケットを購入・保有枚数の確認ができるように」。
--
-- ★ 1行=1枚ではなく「増減の台帳」にする
--   残枚数 = sum(qty)。付与(+2)・購入(+1)・利用(-1) が1本の時系列で並ぶので、
--   「なぜ2枚なのか」がその場で説明できる（お客様に聞かれて答えられない残高を作らない）。
--
-- ★ お支払いが済んでいない購入は残高に入れない
--   status='pending_payment'（カード未登録→店頭でお支払い）は数えない。
--   スタッフが受領したら 'granted' に変えて初めて使える。
--
-- ★ 二重付与・二重消費は索引で止める（画面の作りに頼らない）
--   ・キャンペーンは会員×campaign で1回だけ
--   ・打席予約のレッスンに対する消費は予約1件につき1枚だけ

create table if not exists frunk_lesson_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  member_id uuid not null references frunk_members(id),

  -- grant=プレゼント/店舗付与 / purchase=ご購入 / use=ご利用 / refund=返却（利用の取り消し）
  kind text not null check (kind in ('grant', 'purchase', 'use', 'refund')),
  qty integer not null check (qty <> 0),          -- 付与・購入は正、利用は負
  minutes integer not null default 25,            -- チケットの種類（25分パーソナル）

  -- granted=有効（残高に入る） / pending_payment=店頭でお支払い待ち / void=取り消し
  status text not null default 'granted' check (status in ('granted', 'pending_payment', 'void')),

  unit_price integer,                             -- 税抜単価（購入時・BookingCfg.lesson_option.price が既定）
  amount integer,                                 -- 実際にいただいた税込金額
  payment_method text check (payment_method in ('card', 'store', 'free')),
  paid_at timestamptz,
  square_payment_id text,

  campaign text,                                  -- 例: 'sep2026_join'（9月入会プレゼント）
  booking_id uuid references frunk_bookings(id),  -- 利用したレッスン（打席予約のオプション）
  note text,
  source text not null default 'staff' check (source in ('portal', 'staff', 'auto')),
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_frunk_lesson_tickets_member
  on frunk_lesson_tickets (member_id, created_at desc) where deleted_at is null;

-- 店頭でお支払い待ちを拾うための索引（スタッフ画面の「お支払い待ち」）
create index if not exists idx_frunk_lesson_tickets_pending
  on frunk_lesson_tickets (company_id, created_at) where status = 'pending_payment' and deleted_at is null;

-- キャンペーンは会員1人につき1回だけ（何度呼んでも増えない）
create unique index if not exists uq_frunk_lesson_tickets_campaign
  on frunk_lesson_tickets (member_id, campaign)
  where kind = 'grant' and campaign is not null and deleted_at is null;

-- 1つの予約のレッスンで2枚引かない
create unique index if not exists uq_frunk_lesson_tickets_use_booking
  on frunk_lesson_tickets (booking_id)
  where kind = 'use' and booking_id is not null and deleted_at is null;

alter table frunk_lesson_tickets enable row level security;
-- ポリシー無し = service_role専用（本リポジトリの標準形。認可はアプリ層が持つ）

drop trigger if exists set_updated_at on frunk_lesson_tickets;
create trigger set_updated_at before update on frunk_lesson_tickets
  for each row execute function app.set_updated_at();

comment on table frunk_lesson_tickets is
  'パーソナルレッスン(25分)チケットの増減台帳。残枚数=sum(qty) where status=''granted''。付与/購入/利用が1本の時系列に並ぶ';
comment on column frunk_lesson_tickets.status is
  'granted=有効（残高に入る） / pending_payment=店頭でお支払い待ち（数えない） / void=取り消し';

-- ============================================================
-- 既に9月に入会されている方への付与（#199・ユーザー指示）
--   対象: 一般に公開しているプラン（public_signup）で法人でない、9月入会の在籍会員。
--         スタッフ・テスト・モニターのプランは対象外。
--   何度流しても増えない（uq_frunk_lesson_tickets_campaign）。
--   これ以降の9月入会は、承認時／Web入会の入金確定時にアプリが自動で付ける。
-- ============================================================
insert into frunk_lesson_tickets
  (company_id, store_id, member_id, kind, qty, minutes, status, payment_method, campaign, note, source)
select m.company_id, m.store_id, m.id, 'grant', 2, 25, 'granted', 'free', 'sep2026_join',
       '9月入会キャンペーン（パーソナルレッスン25分 2枚プレゼント）', 'auto'
  from frunk_members m
  join frunk_plans p on p.id = m.plan_id
 where m.deleted_at is null
   and m.status = 'active'
   and m.corporate_parent_id is null
   and p.public_signup is true
   and coalesce(p.is_corporate, false) = false
   and m.join_date between date '2026-09-01' and date '2026-09-30'
on conflict do nothing;
