-- ============================================================
-- 0218 Airレジとの突き合わせ（money-os /airregi）
--
-- ユーザー依頼（2026-10-01）「Airレジのデータと突き合わせて漏れや誤りがないかをチェックしたい。
--   それをスタッフにチェックさせたいので、毎月取り込むところを付けて」
--
-- Airレジ＝「いくら・何で払ったか」の正。money-os＝「誰が・どの商品か」の正。
-- 毎月 Airレジから「ジャーナル履歴」「入出金履歴」のCSVを出して画面から上げる→ここに貯める→
-- 画面を開くたびに mon_sales / mon_expense と突き合わせ直す（直したら差分が自然に消える）。
--
-- ⚠ ここに入る行は売上・経費の集計（refresh_money_to_finance）には**一切流れない**。
--   照合のための控えであって、帳簿の正は従来どおり mon_sales / mon_expense。二重計上は起きない。
-- ============================================================

-- ジャーナル履歴（会計の明細1行＝1行）
create table if not exists mon_airregi_lines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  store_id      uuid not null references stores(id),
  tx_no         text not null,               -- 取引No
  orig_tx_no    text,                        -- 元取引No（返品のとき）
  line_no       int  not null,               -- 取引の中の何行目か
  kind          text not null check (kind in ('会計','返品')),
  tx_date       date not null,               -- 取引日（会計を締めた日）
  tx_time       text,
  product_name  text not null default '',
  unit_price    numeric not null default 0,
  qty           numeric not null default 1,
  net           numeric not null default 0,  -- 税抜・個別割引後（mon_sales.amount と同じ物差し）
  pay           text not null default '',    -- money-os の支払方法名。併用は "/" 区切り
  uploaded_by   text,
  uploaded_at   timestamptz not null default now()
);
-- 同じ月を何度上げても重複しない（上げ直し＝上書き）
create unique index if not exists uq_mon_airregi_lines on mon_airregi_lines(store_id, tx_no, line_no);
create index if not exists idx_mon_airregi_lines_date on mon_airregi_lines(store_id, tx_date);
create index if not exists idx_mon_airregi_lines_orig on mon_airregi_lines(store_id, orig_tx_no) where orig_tx_no is not null;

-- 入出金履歴（レジからの現金の出し入れ。金額0の空打ちは入れない）
create table if not exists mon_airregi_cash (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  store_id      uuid not null references stores(id),
  occurred_at   text not null,               -- 取引日時（"YYYY-MM-DD HH:MM:SS"・JSTのまま）
  biz_date      date not null,               -- 営業日
  kind          text not null check (kind in ('入金','出金')),
  amount        numeric not null,            -- 出金はマイナス
  comment       text,
  uploaded_by   text,
  uploaded_at   timestamptz not null default now()
);
create unique index if not exists uq_mon_airregi_cash on mon_airregi_cash(store_id, occurred_at, amount);
create index if not exists idx_mon_airregi_cash_date on mon_airregi_cash(store_id, biz_date);

-- スタッフの「確認済み」（直さずにOKとした差分）。ref は種類ごとのキー
--   air_line = "取引No#行"（Airレジにあるが money-os に入れない理由がある）
--   sale     = mon_sales.id（money-os にあるが Airレジを通っていない＝Square端末だけ等）
--   pay      = mon_sales.id（支払方法の違いを money-os 側が正しいとした）
--   cash     = "取引日時|金額"（レジの出金を経費に入れない理由がある）
create table if not exists mon_airregi_checks (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  store_id      uuid not null references stores(id),
  ref_kind      text not null check (ref_kind in ('air_line','sale','pay','amount','cash')),
  ref           text not null,
  note          text,
  checked_by    text,
  checked_at    timestamptz not null default now()
);
create unique index if not exists uq_mon_airregi_checks on mon_airregi_checks(store_id, ref_kind, ref);

alter table mon_airregi_lines  enable row level security;
alter table mon_airregi_cash   enable row level security;
alter table mon_airregi_checks enable row level security;

comment on table mon_airregi_lines  is 'Money OS: Airレジ ジャーナル履歴の控え（照合専用・集計に流れない）。/airregi';
comment on table mon_airregi_cash   is 'Money OS: Airレジ 入出金履歴の控え（照合専用・集計に流れない）。/airregi';
comment on table mon_airregi_checks is 'Money OS: Airレジ照合の「確認済み」（直さずOKとした差分と理由）。/airregi';
