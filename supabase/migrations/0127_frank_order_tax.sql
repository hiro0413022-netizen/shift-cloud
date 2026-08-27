-- FRANK モバイルオーダーを外税（税抜価格＋消費税）に変える（#166）
--
-- これまで frunk_menu_items.price_* を「税込」として扱い、そのまま課金していた。
-- ユーザー指定により、メニューの価格は **本体価格（税抜）** とし、
-- 注文時に消費税を加算した総額を請求する。
--
-- 税率は 10%（打席へお持ちする＝店内飲食。軽減税率8%は持ち帰りの扱い）。
-- 税率を行に持つのは、あとから税率が変わっても過去の伝票が変わらないようにするため。

alter table public.frunk_orders
  add column if not exists subtotal   integer,
  add column if not exists tax_rate   integer,
  add column if not exists tax_amount integer;

comment on column public.frunk_orders.subtotal   is '税抜の小計（明細 amount の合計）';
comment on column public.frunk_orders.tax_rate   is '適用した消費税率(%)。注文時点の値を残す。#166以前の行は0（当時は税込価格だった）';
comment on column public.frunk_orders.tax_amount is '消費税額';
comment on column public.frunk_orders.amount     is '請求総額（税込）。Squareへ渡すのはこの値';

-- #166 以前の注文は price を税込として扱っていたので、税額0で埋めて意味を保存する
update public.frunk_orders
   set subtotal   = coalesce(subtotal, amount),
       tax_amount = coalesce(tax_amount, 0),
       tax_rate   = coalesce(tax_rate, 0)
 where subtotal is null or tax_rate is null or tax_amount is null;

comment on column public.frunk_order_items.unit_price is '注文時点の単価（#166以降は税抜の本体価格）';
comment on column public.frunk_order_items.amount     is '税抜の行小計（unit_price × qty）';
comment on column public.frunk_menu_items.price_general is '一般価格（税抜の本体価格・#166）';
comment on column public.frunk_menu_items.price_member  is '会員価格（税抜の本体価格・#166）';
